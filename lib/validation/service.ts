import type { ProjectData } from "@/lib/projects/types";
import { getOpenAIClient } from "@/lib/server/openai";
import { OPENAI_MODEL } from "@/lib/config/llm";

export type SummaryVariationInput = {
  summary: string;
  customPrompt: string;
  citations?: number[];
};

export type SummaryVariationResult = {
  variations: { variant: string; note: string }[];
  mode: "llm" | "sample";
};

export type ReconstructedSummaryInput = {
  project: ProjectData;
  blocks: { id: number; summary: string; citations?: number[] }[];
  targetLength: number;
};

export type ReconstructedSummaryResult = {
  summary: string;
  mode: "llm" | "sample";
};

const VARIATION_SYSTEM_PROMPT =
  "あなたは編集者アシスタントです。提供された要約文を目的に応じて自然な日本語に言い換える案を3つ提案してください。";

const RECONSTRUCT_SYSTEM_PROMPT =
  "あなたは編集者アシスタントです。複数の要約ブロックを再構成し、指定された文字数目安で滑らかな要約文を作成してください。出典に基づいた内容から逸脱しないように注意してください。";

export async function generateSummaryVariations(
  input: SummaryVariationInput
): Promise<SummaryVariationResult> {
  const client = getOpenAIClient();
  if (!client) {
    return buildSampleVariations(input.summary);
  }

  const citations = input.citations ?? [];
  const citationLine = citations.length
    ? `参照チャンク: ${citations.join(", ")}`
    : "";
  const prompt = [
    "対象の要約文:",
    input.summary || "（要約が空です）",
    citationLine,
    "----",
    "リライトの目的:",
    input.customPrompt || "読みやすさを向上させる",
    "----",
    "引用チャンク番号は変えず、必ず出典に基づいて記述してください。",
    "JSON配列で出力してください。各要素は {\"variant\": string, \"note\": string} の形式にしてください。",
    "variant は書き換え後の要約文、note は意図を短く説明します。"
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: VARIATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 750
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return buildSampleVariations(input.summary);
    }
    const parsed = safeParseVariationResponse(content);
    if (!parsed) {
      return buildSampleVariations(input.summary);
    }
    return {
      variations: parsed,
      mode: "llm"
    };
  } catch (error) {
    console.error("要約バリエーション生成に失敗しました:", error);
    return buildSampleVariations(input.summary);
  }
}

export async function generateReconstructedSummary(
  input: ReconstructedSummaryInput
): Promise<ReconstructedSummaryResult> {
  const client = getOpenAIClient();
  if (!client) {
    return buildSampleReconstruction(input);
  }

  const { project, blocks, targetLength } = input;
  const list = blocks
    .map((block, index) => {
      const citationLabel = block.citations?.length ? ` {引用: ${block.citations.join(", ")}}` : "";
      return `${index + 1}. [${block.id}]${citationLabel} ${block.summary}`;
    })
    .join("\n");
  const prompt = [
    `作品: ${project.title}`,
    `目安文字数: 約${targetLength}文字`,
    "利用する要約ブロック:",
    list || "（要約ブロックが空です）",
    "----",
    "これらを自然な一つの要約文に再構成してください。段落は最大でも2つまで、出典の無い情報は加えないでください。引用チャンク番号が変わらないように留意してください。"
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: RECONSTRUCT_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: Math.ceil(targetLength * 1.4)
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      return buildSampleReconstruction(input);
    }
    return {
      summary,
      mode: "llm"
    };
  } catch (error) {
    console.error("再構成要約の生成に失敗しました:", error);
    return buildSampleReconstruction(input);
  }
}

function safeParseVariationResponse(raw: string) {
  try {
    const normalized = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const data = JSON.parse(normalized);
    if (!Array.isArray(data)) {
      return null;
    }
    return data
      .map((item) => ({
        variant: String(item.variant ?? "").trim(),
        note: String(item.note ?? "").trim()
      }))
      .filter((item) => item.variant.length > 0);
  } catch (error) {
    console.warn("JSONの解析に失敗したためサンプル変換を返します:", error);
    return null;
  }
}

function buildSampleVariations(summary: string): SummaryVariationResult {
  if (!summary.trim()) {
    return {
      variations: [
        {
          variant: "要約文が未入力のため、まずは本文をもとに粗い要約を作成してください。",
          note: "下準備"
        }
      ],
      mode: "sample"
    };
  }
  return {
    variations: [
      {
        variant: summary,
        note: "原文を保持した確認用"
      },
      {
        variant: `${summary}（視点と感情トーンを明確に示すリライト例）`,
        note: "視点強化"
      },
      {
        variant: `${summary}（重要語を残しながらテンポを整えた簡潔案）`,
        note: "圧縮"
      }
    ],
    mode: "sample"
  };
}

function buildSampleReconstruction(input: ReconstructedSummaryInput): ReconstructedSummaryResult {
  const { blocks } = input;
  if (!blocks.length) {
    return {
      summary: "要約ブロックが選択されていません。少なくとも1件の要約を用意してください。",
      mode: "sample"
    };
  }
  const joined = blocks
    .map((block, index) => {
      const citationLabel = block.citations?.length ? ` {引用: ${block.citations.join(", ")}}` : "";
      return `${index + 1}. [${block.id}]${citationLabel} ${block.summary}`;
    })
    .join("\n");
  return {
    summary: ["【サンプル再構成】以下の要約を読みやすく連結してください。", joined].join("\n"),
    mode: "sample"
  };
}
