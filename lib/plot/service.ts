import type {
  CharacterRecord,
  EntryRecord,
  ProjectData
} from "@/lib/projects/types";
import { getOpenAIClient } from "@/lib/server/openai";
import { OPENAI_MODEL } from "@/lib/config/llm";
import { MAX_PLOT_CONTEXT_CHARS, PLOT_SAMPLE_TEXT } from "@/lib/config/plot";

export type PlotGenerationInput = {
  project: ProjectData;
  entries: EntryRecord[];
  characters: CharacterRecord[];
};

export type PlotGenerationResult = {
  script: string;
  mode: "llm" | "sample";
};

const PLOT_SYSTEM_PROMPT =
  "あなたは漫画ネーム制作の脚本アシスタントです。提供された本文チャンクを参考に、会話主体の叩き台を生成してください。";

export async function generatePlotScript(
  input: PlotGenerationInput
): Promise<PlotGenerationResult> {
  const llmResult = await tryGenerateWithOpenAI(input);
  if (llmResult) {
    return {
      script: llmResult,
      mode: "llm"
    };
  }
  return {
    script: buildSampleScript(input),
    mode: "sample"
  };
}

async function tryGenerateWithOpenAI(input: PlotGenerationInput) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const { project, entries, characters } = input;
  if (!entries.length) {
    return null;
  }

  const context = buildContext(entries, MAX_PLOT_CONTEXT_CHARS);
  if (!context) {
    return null;
  }

  const rangeLabel = formatRange(entries);
  const characterNames = characters
    .map((character) => character.Name?.trim())
    .filter((name): name is string => Boolean(name));
  const speakers = characterNames.length ? characterNames.join(", ") : "（キャラクター情報なし）";

  const prompt = [
    `作品: ${project.title}`,
    `対象チャンク: ${rangeLabel}`,
    `利用可能なキャラクター: ${speakers}`,
    "本文抜粋:",
    context,
    "----",
    "要件:",
    "- 話者名：「セリフ」の形式で記述",
    "- 場面が変わる際は **Scene 名** を書き、直後に環境・感情・小道具を2〜3行で描写する",
    "- 原文に登場する発話者・セリフは漏らさず順序を維持しつつ、言い回しのみ自然な漫画向けに整える",
    "- ナレーションやト書きで状況補足も行う",
    "- 出力はシンプルなテキスト形式で、Markdown リストなどは使用しない"
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: PLOT_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1400
    });

    const script = completion.choices[0]?.message?.content?.trim();
    if (!script) {
      return null;
    }
    return script;
  } catch (error) {
    console.error("プロット叩き台の生成に失敗しました:", error);
    return null;
  }
}

function buildSampleScript(input: PlotGenerationInput) {
  const { entries } = input;
  if (!entries.length) {
    return "【サンプル】チャンクが選択されていません。";
  }
  const rangeLabel = formatRange(entries);
  return [`【サンプルプロット】範囲: ${rangeLabel}`, PLOT_SAMPLE_TEXT].join("\n\n");
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

function formatRange(entries: EntryRecord[]) {
  if (!entries.length) {
    return "未選択";
  }
  const first = entries[0];
  const last = entries[entries.length - 1];
  return entries.length === 1 ? `チャンク ${first.id}` : `チャンク ${first.id}〜${last.id}`;
}
