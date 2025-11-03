import type { CharacterRecord, EntryRecord, ProjectData } from "@/lib/projects/types";
import { OPENAI_MODEL } from "@/lib/config/llm";
import { getOpenAIClient } from "@/lib/server/openai";

const CHARACTER_SYSTEM_PROMPT =
  "あなたは漫画制作のキャラクター監修アシスタントです。登場人物の設定と本文抜粋を読み、編集者向けのメモを整理してください。";

const SAMPLE_LINES = [
  "1. キャラクター概要（2〜3文）",
  "2. 性格・価値観",
  "3. 技能/強みと弱み",
  "4. 関係性メモ（本文から推測できる範囲）"
];

export type CharacterAnalysisInput = {
  project: ProjectData;
  character: CharacterRecord;
  entries: EntryRecord[];
};

export type CharacterAnalysisResult = {
  analysis: string;
  citations: number[];
  mode: "llm" | "sample";
};

export async function generateCharacterAnalysis(
  input: CharacterAnalysisInput
): Promise<CharacterAnalysisResult> {
  const llmResult = await tryGenerateWithOpenAI(input);
  if (llmResult) {
    return {
      analysis: llmResult.analysis,
      citations: llmResult.citations,
      mode: "llm"
    };
  }
  return {
    ...buildSampleAnalysis(input),
    mode: "sample"
  };
}

async function tryGenerateWithOpenAI(input: CharacterAnalysisInput) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const { project, character, entries } = input;
  const name = character.Name?.trim();
  if (!name) {
    return null;
  }

  const contextText = buildContextText(entries);
  const role = character.Role ?? "";
  const details = character.Details ?? "";
  const promptLines: string[] = [
    `作品: ${project.title}`,
    `キャラクター名: ${name}`,
    `役割: ${role || "未設定"}`,
    "人物詳細メモ:",
    details || "（補足情報なし）",
    "参考本文抜粋:",
    contextText || "（本文参照なし）",
    "----",
    "以下の構成で日本語出力してください:",
    ...SAMPLE_LINES
  ];

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: CHARACTER_SYSTEM_PROMPT },
        { role: "user", content: promptLines.join("\n") }
      ],
      temperature: 0.25,
      max_tokens: 900
    });
    const analysis = completion.choices[0]?.message?.content?.trim();
    if (!analysis) {
      return null;
    }
    return {
      analysis,
      citations: entries.map((entry) => entry.id)
    };
  } catch (error) {
    console.error("キャラクター解析の呼び出しに失敗しました:", error);
    return null;
  }
}

function buildSampleAnalysis(input: CharacterAnalysisInput) {
  const { character, entries } = input;
  const name = character.Name || "（名称不明）";
  const role = character.Role || "未設定";
  const details = (character.Details || "").trim();
  const citationLabel = entries.length
    ? entries.map((entry) => entry.id).join(", ")
    : "なし";

  const intro = [`【サンプル設定メモ】${name}`, `- 役割: ${role}`];
  if (details) {
    const truncated = details.length > 200 ? `${details.slice(0, 200)}…` : details;
    intro.push(`- 詳細: ${truncated}`);
  } else {
    intro.push("- 詳細: （未設定）");
  }
  intro.push(`- 参考チャンク: ${citationLabel}`);
  intro.push("");
  intro.push("想定アウトライン:");
  intro.push(...SAMPLE_LINES.map((line) => `- ${line}`));

  return {
    analysis: intro.join("\n"),
    citations: entries.map((entry) => entry.id)
  };
}

function buildContextText(entries: EntryRecord[]) {
  if (!entries.length) {
    return "";
  }
  const normalized = entries.map((entry) => `[${entry.id}] ${entry.text.trim()}`);
  return normalized.join("\n\n");
}

export async function extractCharactersFromText(text: string, limit = 10) {
  const excerpt = text.trim();
  const fallback = buildSampleCharacters(excerpt, limit);
  if (!excerpt) {
    return fallback;
  }
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
          content:
            "あなたは編集者アシスタントです。本文から主要な登場人物を抽出し、名前・役割・特徴を整理してください。"
        },
        {
          role: "user",
          content: [
            `以下の本文から最多${limit}名の登場人物を抽出し、JSON配列で返してください。`,
            '各要素は {"Name": "名前", "Role": "役割", "Details": "120文字以内の説明"} とします。',
            "本文:",
            excerpt.slice(0, 6000)
          ].join("\n")
        }
      ],
      temperature: 0.3,
      max_tokens: 900
    });
    const payload = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = parseCharacterArray(payload);
    if (parsed.length) {
      return parsed.slice(0, limit);
    }
  } catch (error) {
    console.error("キャラクター抽出の呼び出しに失敗しました:", error);
  }
  return fallback;
}

function parseCharacterArray(raw: string): CharacterRecord[] {
  try {
    const normalized = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(normalized);
    if (!Array.isArray(data)) {
      return [];
    }
    const records: CharacterRecord[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const name = String((item as Record<string, unknown>).Name ?? (item as Record<string, unknown>).name ?? "").trim();
      if (!name) continue;
      records.push({
        Name: name,
        Role: String((item as Record<string, unknown>).Role ?? (item as Record<string, unknown>).role ?? "").trim(),
        Details: String((item as Record<string, unknown>).Details ?? (item as Record<string, unknown>).details ?? "").trim()
      });
    }
    return records;
  } catch (error) {
    console.warn("キャラクターJSONの解析に失敗しました:", error);
    return [];
  }
}

function buildSampleCharacters(text: string, limit: number): CharacterRecord[] {
  if (!text) {
    return [];
  }
  const nameMatch = text.match(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,6})/u);
  if (!nameMatch) {
    return [];
  }
  return [
    {
      Name: nameMatch[1],
      Role: "主要人物",
      Details: "本文から抽出した候補です。LLMが無効のため簡易推定を表示しています。"
    }
  ].slice(0, limit);
}
