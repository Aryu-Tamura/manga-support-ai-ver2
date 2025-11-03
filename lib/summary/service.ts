import type { EntryRecord, ProjectData } from "@/lib/projects/types";
import { OPENAI_MODEL, OVERALL_SUMMARY_PROMPT, SUMMARY_SYSTEM_PROMPT } from "@/lib/config/llm";
import { MAX_CONTEXT_CHARS } from "@/lib/config/summary";
import { getOpenAIClient } from "@/lib/server/openai";

export type SummaryGenerationInput = {
  project: ProjectData;
  entries: EntryRecord[];
  grain: number;
};

export type SummaryGenerationResult = {
  summary: string;
  citations: number[];
  mode: "llm" | "sample";
};

const MAX_SENTENCE_LENGTH = 160;

export async function generateSummary(
  input: SummaryGenerationInput
): Promise<SummaryGenerationResult> {
  const llmResult = await tryGenerateWithOpenAI(input);
  if (llmResult) {
    return {
      summary: llmResult.summary,
      citations: llmResult.citations,
      mode: "llm"
    };
  }

  return {
    ...buildSampleSummary(input),
    mode: "sample"
  };
}

async function tryGenerateWithOpenAI(input: SummaryGenerationInput) {
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
  const userPrompt = [
    `作品: ${project.title}`,
    `対象チャンク: ${rangeLabel}（全${project.entries.length}チャンク）`,
    `目安文字数: 約${grain}文字`,
    "テキスト:",
    context,
    "----",
    "要約のみを日本語で出力してください。"
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: Math.ceil(grain * 1.2)
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      return null;
    }

    return {
      summary,
      citations: entries.map((entry) => entry.id)
    };
  } catch (error) {
    console.error("要約生成の呼び出しに失敗しました:", error);
    return null;
  }
}

function buildSampleSummary(input: SummaryGenerationInput) {
  const { project, entries, grain } = input;
  if (!entries.length) {
    return {
      summary: "対象チャンクが選択されていません。範囲を指定してください。",
      citations: []
    };
  }

  const rangeLabel = formatRange(entries);
  const characterCount = entries.reduce((count, entry) => count + entry.text.length, 0);
  const estimatedLength = Math.min(grain, Math.max(120, Math.round(characterCount * 0.3)));
  const citationIds = entries.map((entry) => entry.id);

  const digest = entries
    .slice(0, 4)
    .map((entry) => {
      const base = entry.summary?.trim() || entry.text.trim();
      const truncated = truncateText(base.replace(/\s+/g, " ").trim(), MAX_SENTENCE_LENGTH);
      return `・[${entry.id}] ${truncated}`;
    })
    .join("\n");

  const summary = [
    `【サンプル要約】${project.title} の ${rangeLabel} を約${estimatedLength}文字で把握するダイジェストです。`,
    "後続のタスクで OpenAI API を接続すると、実際の要約結果がここに表示されます。",
    digest
      ? "\n【本文ハイライト】\n" + digest
      : "\n本文の情報が少ないため、要約を生成できませんでした。"
  ].join("\n");

  return {
    summary,
    citations: citationIds
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
  const joined = entries.map((entry) => `[${entry.id}] ${entry.text}`).join("\n\n");
  if (!limit || joined.length <= limit) {
    return joined;
  }
  return joined.slice(0, limit);
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
