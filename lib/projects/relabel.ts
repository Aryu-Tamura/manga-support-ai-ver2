import type { EntryRecord } from "@/lib/projects/types";
import { runChatCompletion } from "@/lib/llm/client";

type RelabelOptions = {
  fullText: string;
  styleHint?: string;
  chunkTarget?: number;
};

const MAX_PARAGRAPH = 160;

export async function relabelTextWithLLM(options: RelabelOptions): Promise<EntryRecord[]> {
  const { fullText, styleHint, chunkTarget = 180 } = options;
  const request = buildPrompt(fullText, styleHint, chunkTarget);
  const result = await runChatCompletion(request);
  if (!result.ok) {
    return createFallbackEntries(fullText);
  }
  const parsed = parseEntries(result.output);
  if (parsed.length === 0) {
    return createFallbackEntries(fullText);
  }
  return parsed.slice(0, 400);
}

function buildPrompt(text: string, styleHint = "", chunkTarget = 180) {
  const system = `あなたは編集者アシスタントです。本文を漫画のカット単位に分割し、各カットに詳細なメタ情報を付与するよう求められています。`;
  const user = [
    "以下の要件に従って本文をカット分割してください。",
    `- 目標文字数: ${chunkTarget}文字前後（最低80文字、最大220文字）`,
    "- 話者が変わる・地の文と会話が切り替わるタイミングを優先して分割",
    "- 各カットはJSONオブジェクトとして以下項目を含む",
    '{"id_local":"k001", "text":"...", "type":"dialogue|narration|monologue|sfx|stage_direction", "speaker":"unknown", "time":"present|flashback|unknown", "location":"", "tone":"neutral|tense|comedic...", "emotion":"neutral", "action":"", "entities":[], "source_local_span":{"start":0,"end":10}}',
    "- 出力はJSON配列のみ",
    styleHint ? `- 作風ヒント: ${styleHint}` : "",
    "本文:",
    text
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user }
  ];
}

function parseEntries(raw: string): EntryRecord[] {
  try {
    const normalized = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(normalized);
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((item, index) => normalizeEntry(item, index))
      .filter((entry): entry is EntryRecord => entry !== null);
  } catch (error) {
    console.warn("カット分割結果の解析に失敗しました:", error);
    return [];
  }
}

function normalizeEntry(value: unknown, index: number): EntryRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Record<string, unknown>;
  const text = String(item.text ?? "").trim();
  if (!text) {
    return null;
  }
  return {
    id: index + 1,
    text,
    type: String(item.type ?? "narration"),
    speakers: Array.isArray(item.speakers)
      ? item.speakers.map((speaker) => String(speaker))
      : item.speaker
        ? [String(item.speaker)]
        : [],
    time: String(item.time ?? "unknown"),
    location: String(item.location ?? ""),
    tone: String(item.tone ?? "neutral"),
    emotion: String(item.emotion ?? "neutral"),
    action: String(item.action ?? ""),
    entities: Array.isArray(item.entities)
      ? item.entities.map((entity) => String(entity))
      : [],
    sourceSpan: normalizeSpan(item.source_local_span),
    summary: String(item.summary ?? "")
  };
}

function normalizeSpan(span: unknown) {
  if (!span || typeof span !== "object") {
    return { start: -1, end: -1 };
  }
  const value = span as Record<string, unknown>;
  const start = Number(value.start ?? -1);
  const end = Number(value.end ?? -1);
  return { start, end };
}

function createFallbackEntries(text: string): EntryRecord[] {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return [
      {
        id: 1,
        text,
        type: "narration",
        speakers: [],
        time: "unknown",
        location: "",
        tone: "neutral",
        emotion: "neutral",
        action: "",
        entities: [],
        sourceSpan: { start: -1, end: -1 },
        summary: text.slice(0, MAX_PARAGRAPH) + (text.length > MAX_PARAGRAPH ? "…" : "")
      }
    ];
  }
  return paragraphs.slice(0, 200).map((segment, index) => ({
    id: index + 1,
    text: segment,
    type: "narration",
    speakers: [],
    time: "unknown",
    location: "",
    tone: "neutral",
    emotion: "neutral",
    action: "",
    entities: [],
    sourceSpan: { start: -1, end: -1 },
    summary: segment.slice(0, MAX_PARAGRAPH) + (segment.length > MAX_PARAGRAPH ? "…" : "")
  }));
}
