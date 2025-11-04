import type { EntryRecord, ProjectData, SummarySentence } from "@/lib/projects/types";
import { OPENAI_MODEL, OVERALL_SUMMARY_PROMPT, SUMMARY_SYSTEM_PROMPT } from "@/lib/config/llm";
import { MAX_CONTEXT_CHARS, SUMMARY_ENTRY_CONTEXT_LENGTH } from "@/lib/config/summary";
import { getOpenAIClient } from "@/lib/server/openai";

export type SummaryGenerationInput = {
  project: ProjectData;
  entries: EntryRecord[];
  grain: number;
};

export type SummaryGenerationResult = {
  summary: string;
  sentences: SummarySentence[];
  citations: number[];
  mode: "llm" | "sample";
};

const MAX_SENTENCE_LENGTH = 160;

export async function generateSummary(
  input: SummaryGenerationInput
): Promise<SummaryGenerationResult> {
  const llmSentences = await tryGenerateWithOpenAI(input);
  if (llmSentences && llmSentences.length > 0) {
    const summary = joinSentences(llmSentences);
    return {
      summary,
      sentences: llmSentences,
      citations: collectCitations(llmSentences),
      mode: "llm"
    };
  }

  const fallback = buildSampleSummary(input);
  return {
    ...fallback,
    mode: "sample"
  };
}

async function tryGenerateWithOpenAI(
  input: SummaryGenerationInput
): Promise<SummarySentence[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const { project, entries, grain } = input;
  if (!entries.length) {
    return null;
  }

  const context = buildContext(entries, MAX_CONTEXT_CHARS);
  if (!context) {
    return null;
  }

  const rangeLabel = formatRange(entries);
  const availableIds = entries.map((entry) => entry.id);
  const userPrompt = [
    `作品: ${project.title}`,
    `対象チャンク: ${rangeLabel}（全${project.entries.length}チャンク）`,
    `目安文字数: 約${grain}文字`,
    "テキスト（各行は [チャンク番号] 抜粋形式、抜粋は短く要約されています）:",
    context,
    "----",
    "文ごとに要約を整理し、JSON配列のみを返してください。",
    '各要素は {"text": "...", "citations": [チャンクID,...]} の形です。',
    "citations には入力テキストで示したチャンク番号（例: [12]）から1〜3件を入れてください。",
    "JSON 以外の文字列は含めないでください。"
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: Math.ceil(grain * 1.4)
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    const sentences = parseSummarySentences(raw, availableIds);
    if (sentences.length === 0) {
      return null;
    }
    return sentences;
  } catch (error) {
    console.error("要約生成の呼び出しに失敗しました:", error);
    return null;
  }
}

function parseSummarySentences(raw: string, availableIds: number[]): SummarySentence[] {
  try {
    const normalized = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const data = JSON.parse(normalized);
    if (!Array.isArray(data)) {
      return [];
    }
    const allowed = new Set(availableIds);
    return data
      .map((item) => normalizeSentence(item, allowed))
      .filter((sentence): sentence is SummarySentence => sentence !== null);
  } catch (error) {
    console.warn("要約JSONの解析に失敗しました:", error);
    return [];
  }
}

function normalizeSentence(value: unknown, allowed: Set<number>): SummarySentence | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const text = String(record.text ?? "").trim();
  if (!text) {
    return null;
  }
  const rawCitations = Array.isArray(record.citations) ? record.citations : [];
  const citations = rawCitations
    .map((citation) => Number(citation))
    .filter((citation) => Number.isInteger(citation) && allowed.has(citation))
    .slice(0, 3);
  return {
    text,
    citations
  };
}

function collectCitations(sentences: SummarySentence[]): number[] {
  const seen = new Set<number>();
  for (const sentence of sentences) {
    for (const citation of sentence.citations) {
      if (Number.isInteger(citation)) {
        seen.add(citation);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function joinSentences(sentences: SummarySentence[]): string {
  return sentences.map((sentence) => sentence.text).join(" ");
}

function buildSampleSummary(
  input: SummaryGenerationInput
): Omit<SummaryGenerationResult, "mode"> {
  const { entries } = input;
  if (!entries.length) {
    const text = "対象チャンクが選択されていません。範囲を指定してください。";
    return {
      summary: text,
      sentences: [{ text, citations: [] }],
      citations: []
    };
  }

  const topEntries = entries.slice(0, 4);
  const sentences: SummarySentence[] = topEntries.map((entry) => {
    const base = entry.summary?.trim() || entry.text.trim();
    const compact = base.replace(/\s+/g, " ").trim();
    const text = truncateText(compact, MAX_SENTENCE_LENGTH);
    return {
      text,
      citations: [entry.id]
    };
  });

  if (sentences.length === 0) {
    const fallback = "本文の情報が少ないため、要約を生成できませんでした。";
    return {
      summary: fallback,
      sentences: [{ text: fallback, citations: [] }],
      citations: []
    };
  }

  const summary = joinSentences(sentences);
  return {
    summary,
    sentences,
    citations: collectCitations(sentences)
  };
}

function formatRange(entries: EntryRecord[]): string {
  if (!entries.length) {
    return "未選択";
  }
  const first = entries[0];
  const last = entries[entries.length - 1];
  return entries.length === 1 ? `チャンク ${first.id}` : `チャンク ${first.id}〜${last.id}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function buildContext(entries: EntryRecord[], limit: number) {
  if (!entries.length) {
    return "";
  }
  const formatEntry = (entry: EntryRecord) => {
    const base = entry.summary?.trim().length ? entry.summary.trim() : entry.text;
    const normalized = base.replace(/\s+/g, " ").trim();
    const maxLength = Math.max(60, SUMMARY_ENTRY_CONTEXT_LENGTH);
    const truncated =
      normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
    return `[${entry.id}] ${truncated}`;
  };

  const joined = entries.map(formatEntry).join("\n\n");
  if (limit && limit > 0 && joined.length > limit) {
    return joined.slice(0, limit);
  }
  return joined;
}

export async function generateOverallSummaryFromText(title: string, text: string) {
  const client = getOpenAIClient();
  const excerpt = text.trim().slice(0, 12000);
  if (!client) {
    return buildSampleOverallSummary(excerpt);
  }

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: OVERALL_SUMMARY_PROMPT },
        {
          role: "user",
          content: [
            `作品タイトル: ${title}`,
            "本文抜粋（最大12000字）:",
            excerpt || "（本文が空です）",
            "----",
            "上記を踏まえた作品全体の要約を1段落で出力してください。"
          ].join("\n")
        }
      ],
      temperature: 0.3,
      max_tokens: 600
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    if (summary) {
      return summary;
    }
  } catch (error) {
    console.error("作品全体の要約生成に失敗:", error);
  }
  return buildSampleOverallSummary(excerpt);
}

function buildSampleOverallSummary(text: string) {
  if (!text) {
    return "作品本文が空のためサンプル要約を生成できません。";
  }
  const paragraphs = text
    .split(/\r?\n\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 3);
  const joined = paragraphs.join(" ");
  return joined.slice(0, 600) + (joined.length > 600 ? "…" : "");
}

export async function generateEntrySummary(text: string, targetLength = 160) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const fallback = trimmed.slice(0, targetLength) + (trimmed.length > targetLength ? "…" : "");
  const client = getOpenAIClient();
  if (!client) {
    return fallback;
  }
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `あなたは編集者アシスタントです。入力された本文を1〜2文、約${targetLength}文字で要約してください。重要な固有名詞と出来事を残し、過剰な創作はしないこと。`
        },
        {
          role: "user",
          content: [`本文:\n${trimmed}`, "----", "要約のみを日本語で出力してください。"].join("\n")
        }
      ],
      temperature: 0.2,
      max_tokens: Math.ceil(targetLength * 1.4)
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    return summary || fallback;
  } catch (error) {
    console.error("チャンク要約の生成に失敗:", error);
    return fallback;
  }
}
