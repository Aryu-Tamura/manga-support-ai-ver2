import { OPENAI_MODEL } from "@/lib/config/llm";
import { getOpenAIClient } from "@/lib/server/openai";
import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import {
  PICTURE_BOOK_PHASES,
  buildPhaseDistribution,
  buildImagePrompt,
  clampCharacters,
  type PictureBookPage,
  type PictureBookPhase
} from "@/lib/picture-book/utils";

type GeneratePictureBookDraftParams = {
  projectTitle: string;
  entries: EntryRecord[];
  sentences: SummarySentence[];
  pageCount: number;
};

type LlmPictureBookResponse = {
  pages: Array<{
    phase: string;
    narration: string;
    dialogues: string[];
  }>;
};

const MAX_NARRATION_LENGTH = 200;
const MAX_DIALOGUE_LENGTH = 100;

export async function generatePictureBookDraft(
  params: GeneratePictureBookDraftParams
): Promise<PictureBookPage[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const { projectTitle, entries, sentences, pageCount } = params;
  const effectiveCount = Math.max(1, pageCount);

  const summaryPoints =
    sentences.length > 0
      ? sentences
          .slice(0, effectiveCount * 2)
          .map((sentence, index) => `${index + 1}. ${clampCharacters(sentence.text, MAX_NARRATION_LENGTH)}`)
          .join("\n")
      : entries
          .slice(0, effectiveCount * 2)
          .map((entry, index) => `${index + 1}. ${clampCharacters(entry.summary || entry.text, MAX_NARRATION_LENGTH)}`)
          .join("\n");

  const characterHints = extractCharacterHints(entries, 6);

  const prompt = [
    "あなたはコミカライズ向けの絵本編集アシスタントです。",
    `作品タイトル: ${projectTitle}`,
    `総ページ数: ${effectiveCount}`,
    "",
    "【物語の要点】",
    summaryPoints || "情報が少ないため、起承転結が伝わるよう想像で補ってください。",
    "",
    "【登場人物のヒント】",
    characterHints || "登場人物情報が不足しています。既存の名前が無い場合は「語り手」など中立的な呼称を使ってください。",
    "",
    "以下の条件で JSON を生成してください:",
    "- 配列 `pages` を含む JSON オブジェクトのみを出力すること。",
    "- `pages` は指定されたページ数の順序付き配列。",
    '- 各要素は {"phase": "起/承/転/結", "narration": "…", "dialogues": ["話者：セリフ", ...]} の形式。',
    "- phase は起承転結の順番でバランス良く割り当てること。",
    "- narration は状況説明を200文字以内の自然な日本語で書くこと。",
    "- dialogues は各ページ2〜3行、100文字以内。話者名が判明していれば付け、なければ「語り手」。",
    "- セリフ内に引用チャンク番号や脚注、括弧番号などは絶対に含めないこと。",
    "- JSON 以外の文章や説明は一切書かないこと。"
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: Math.min(2400, 200 * effectiveCount),
      messages: [
        {
          role: "system",
          content:
            "あなたは構成力に優れた絵本編集者です。指定された情報をもとに、起承転結と会話の流れが自然なストーリーを日本語で構築してください。"
        },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    const parsed = parseResponse(raw);
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return null;
    }
    return normalisePages(parsed.pages, effectiveCount);
  } catch (error) {
    console.error("絵本用ドラフト生成に失敗しました:", error);
    return null;
  }
}

function parseResponse(raw: string): LlmPictureBookResponse | null {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleaned) as LlmPictureBookResponse;
    if (!data || typeof data !== "object" || !Array.isArray(data.pages)) {
      return null;
    }
    return data;
  } catch (error) {
    console.warn("絵本ドラフトJSONの解析に失敗しました:", error);
    return null;
  }
}

function normalisePages(rawPages: LlmPictureBookResponse["pages"], targetCount: number): PictureBookPage[] {
  const results: PictureBookPage[] = [];
  const phases = distributePhases(rawPages, targetCount);

  for (let index = 0; index < targetCount; index += 1) {
    const source = rawPages[index] ?? rawPages[rawPages.length - 1];
    const phase = phases[index] ?? PICTURE_BOOK_PHASES[PICTURE_BOOK_PHASES.length - 1];
    const narration = clampCharacters((source?.narration ?? "").replace(/\s+/g, " ").trim(), MAX_NARRATION_LENGTH);
    const dialogues = Array.isArray(source?.dialogues)
      ? source.dialogues
          .map((line) => clampCharacters(line.replace(/\s+/g, " ").trim(), MAX_DIALOGUE_LENGTH))
          .filter((line) => line.length > 0)
          .slice(0, 3)
      : [];
    const ensuredDialogues = ensureMinimumDialogues(dialogues, narration || "");

    results.push({
      id: `page-${index + 1}`,
      pageNumber: index + 1,
      phase,
      narration: narration || "シーンの概要を入力してください。",
      dialogues: ensuredDialogues,
      imagePrompt: buildImagePrompt(phase, narration || ""),
      imageUrl: null,
      citations: []
    });
  }

  return results;
}

function distributePhases(pages: LlmPictureBookResponse["pages"], targetCount: number): PictureBookPhase[] {
  const phases: PictureBookPhase[] = [];
  const defaultSequence = buildPhaseSequence(targetCount);

  for (let index = 0; index < targetCount; index += 1) {
    const candidatePhase = normalizePhase(pages[index]?.phase);
    phases.push(candidatePhase ?? defaultSequence[index]);
  }

  return phases;
}

function buildPhaseSequence(count: number): PictureBookPhase[] {
  const perPhaseCounts = buildPhaseDistribution(Math.max(1, count));
  const phases: PictureBookPhase[] = [];
  for (let index = 0; index < perPhaseCounts.length; index += 1) {
    const span = perPhaseCounts[index];
    const phase = PICTURE_BOOK_PHASES[index];
    for (let cursor = 0; cursor < span && phases.length < count; cursor += 1) {
      phases.push(phase);
    }
  }
  return phases.length === count ? phases : fillPhaseFallback(count);
}

function fillPhaseFallback(count: number): PictureBookPhase[] {
  const sequence: PictureBookPhase[] = [];
  for (let index = 0; index < count; index += 1) {
    sequence.push(PICTURE_BOOK_PHASES[index % PICTURE_BOOK_PHASES.length]);
  }
  return sequence;
}

function normalizePhase(phase: unknown): PictureBookPhase | null {
  if (!phase || typeof phase !== "string") {
    return null;
  }
  const trimmed = phase.trim();
  if ((PICTURE_BOOK_PHASES as readonly string[]).includes(trimmed)) {
    return trimmed as PictureBookPhase;
  }

  if (/起/i.test(trimmed)) {
    return "起";
  }
  if (/承/i.test(trimmed)) {
    return "承";
  }
  if (/転/i.test(trimmed)) {
    return "転";
  }
  if (/結/i.test(trimmed)) {
    return "結";
  }
  return null;
}

function extractCharacterHints(entries: EntryRecord[], limit: number): string {
  const seen = new Set<string>();
  const hints: string[] = [];

  for (const entry of entries) {
    for (const speaker of entry.speakers) {
      const name = speaker?.trim();
      if (!name || name.toLowerCase() === "unknown" || seen.has(name)) {
        continue;
      }
      seen.add(name);
      hints.push(`- ${name}`);
      if (hints.length >= limit) {
        break;
      }
    }
    if (hints.length >= limit) {
      break;
    }
  }

  if (hints.length === 0) {
    return "";
  }
  return hints.join("\n");
}

function ensureMinimumDialogues(dialogues: string[], narration: string): string[] {
  const results = [...dialogues];
  if (results.length >= 2) {
    return results.slice(0, 3);
  }

  const sentences = narration
    .split(/[。！？!?]/)
    .map((sentence) => sentence.replace(/[「」『』]/g, "").trim())
    .filter((sentence) => sentence.length > 0);

  for (const sentence of sentences) {
    if (results.length >= 3) {
      break;
    }
    const content = clampCharacters(sentence, MAX_DIALOGUE_LENGTH);
    results.push(`語り手：「${content}」`);
  }

  while (results.length < 2 && results.length < 3) {
    results.push("語り手：「……」");
  }

  return results.slice(0, 3);
}
