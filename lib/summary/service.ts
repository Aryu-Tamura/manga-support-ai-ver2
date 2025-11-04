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

  const sentenceBounds = computeSentenceBounds(grain, entries.length);
  const coverageInstruction = buildCoverageInstruction(entries);

  const rangeLabel = formatRange(entries);
  const userPrompt = [
    `作品: ${project.title}`,
    `対象チャンク: ${rangeLabel}（全${project.entries.length}チャンク）`,
    `目安文字数: 約${grain}文字`,
    "テキスト（各行は [チャンク番号] 抜粋形式、抜粋は短く要約されています）:",
    context,
    "----",
    "文ごとに要約を整理し、JSON配列のみを返してください。",
    '各要素は {"text": "...", "citations": [チャンクID,...]} の形です。',
    "citations には入力テキストで示したチャンク番号（例: [12]）から最大2件まで入れてください。各文で扱った出来事・心情に直接対応するチャンク番号のみを記載し、無関係なチャンクは含めないでください。",
    coverageInstruction,
    `要約文は${sentenceBounds.min}〜${sentenceBounds.max}文を目安にしてください（約${grain}文字に収まらない場合は文数を調整して構いません）。`,
    "ストーリーの進行が分かるよう、因果関係や登場人物の心情変化を簡潔に示してください。",
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

  const sentences = parseSummarySentences(raw, entries);
    if (sentences.length === 0) {
      return null;
    }
    return sentences;
  } catch (error) {
    console.error("要約生成の呼び出しに失敗しました:", error);
    return null;
  }
}

function parseSummarySentences(raw: string, entries: EntryRecord[]): SummarySentence[] {
  const normalized = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const jsonArray = extractJsonArray(normalized);
  if (!jsonArray) {
    console.warn("要約JSONの解析に失敗しました: JSON配列が検出できませんでした。");
    return [];
  }

  const parsed = parseJsonArray(jsonArray) ?? parseLenientArray(jsonArray);
  if (!parsed || !Array.isArray(parsed)) {
    console.warn("要約JSONの解析に失敗しました: 配列のパースに失敗しました。レスポンス抜粋:", jsonArray.slice(0, 2000));
    return [];
  }
  const allowed = new Set(entries.map((entry) => entry.id));
  const normalizedSentences = parsed
    .map((item) => normalizeSentence(item, allowed))
    .filter((sentence): sentence is SummarySentence => sentence !== null);
  const deduped = deduplicateSentences(normalizedSentences);
  const expanded = expandSummarySentences(deduped);
  return fillMissingCitations(expanded, entries);
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
    .slice(0, 2);
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
  const seen = new Set<string>();
  const sentences: SummarySentence[] = [];
  for (const entry of topEntries) {
    const source = entry.text?.trim().length ? entry.text.trim() : entry.summary?.trim() ?? "";
    const compact = source.replace(/\s+/g, " ").trim();
    if (!compact) {
      continue;
    }
    if (seen.has(compact)) {
      continue;
    }
    seen.add(compact);
    const text = truncateText(compact, MAX_SENTENCE_LENGTH);
    sentences.push({
      text,
      citations: [entry.id]
    });
  }

  const uniqueSentences = deduplicateSentences(sentences);

  if (uniqueSentences.length === 0) {
    const fallback = "本文の情報が少ないため、要約を生成できませんでした。";
    return {
      summary: fallback,
      sentences: [{ text: fallback, citations: [] }],
      citations: []
    };
  }

  const summary = joinSentences(uniqueSentences);
  return {
    summary,
    sentences: uniqueSentences,
    citations: collectCitations(uniqueSentences)
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

function computeSentenceBounds(grain: number, entryCount: number): { min: number; max: number } {
  const normalizedGrain = Math.max(200, Math.min(1500, grain));
  if (normalizedGrain <= 350) {
    return entryCount <= 30 ? { min: 4, max: 8 } : { min: 5, max: 9 };
  }
  if (normalizedGrain <= 600) {
    return entryCount <= 60 ? { min: 6, max: 12 } : { min: 8, max: 14 };
  }
  return entryCount <= 120 ? { min: 9, max: 16 } : { min: 11, max: 18 };
}

function buildEntrySegments(entries: EntryRecord[], targetSegmentCount: number) {
  if (!entries.length || targetSegmentCount <= 0) {
    return [] as Array<{ startId: number; endId: number }>;
  }

  const count = Math.min(targetSegmentCount, entries.length);
  const segments: Array<{ startId: number; endId: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const startIndex = Math.floor((entries.length * index) / count);
    const endIndex = Math.max(
      startIndex,
      Math.min(entries.length - 1, Math.floor((entries.length * (index + 1)) / count) - 1)
    );
    const startId = entries[startIndex]?.id ?? entries[0].id;
    const endId = entries[endIndex]?.id ?? entries[entries.length - 1].id;
    segments.push({ startId, endId });
  }

  return segments;
}

function buildCoverageInstruction(entries: EntryRecord[]): string {
  const entryCount = entries.length;
  if (entryCount === 0) {
    return "要約は選択範囲内の重要な出来事を漏れなく含め、時系列で簡潔に整理してください。";
  }

  if (entryCount < 20) {
    return "要約は選択範囲内の重要な出来事を漏れなく含め、時系列で簡潔に整理してください。";
  }

  const segments = buildEntrySegments(entries, 3);
  const labels = ["序盤", "中盤", "終盤"];
  const segmentText = segments
    .map((segment, index) => {
      const label = labels[index] ?? `第${index + 1}部`;
      return `${label}（チャンク ${segment.startId}〜${segment.endId}）`;
    })
    .join("、");

  return `要約はチャンク範囲全体を網羅し、${segmentText} からそれぞれ少なくとも1文ずつ引用してください。主要な出来事と心情の変化を時系列で整理し、空白期間が生まれないようにしてください。`;
}

function extractJsonArray(value: string): string | null {
  const start = value.indexOf("[");
  const end = value.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return value.slice(start, end + 1);
}

function parseJsonArray(source: string): unknown[] | null {
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch (initialError) {
    try {
      const repaired = repairJsonArray(source);
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch (error) {
      console.warn("要約JSONの解析に失敗しました:", error);
      return null;
    }
  }
}

function repairJsonArray(value: string): string {
  let result = value.trim();
  const stringPattern = /"((?:\\.|[^"\\])*)"/g;
  result = result.replace(stringPattern, (match, inner) => {
    const sanitized = String(inner)
      .replace(/\r?\n/g, "\\n")
      .replace(/\t/g, "\\t");
    return `"${sanitized}"`;
  });
  result = result.replace(/("text"\s*:\s*"(?:\\.|[^"\\])*")\s+("citations")/g, '$1, $2');
  result = result.replace(/,\s*(\}|\])/g, "$1");
  return result;
}

function parseLenientArray(source: string): unknown[] | null {
  const text = source.trim();
  if (!text.startsWith("[") || !text.includes("{")) {
    return null;
  }

  const results: unknown[] = [];
  let inString = false;
  let isEscaped = false;
  let braceDepth = 0;
  let objectStart = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      if (inString) {
        isEscaped = true;
      }
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (braceDepth === 0) {
        objectStart = index;
      }
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth === 0 && objectStart !== -1) {
        const snippet = text.slice(objectStart, index + 1);
        try {
          const parsed = JSON.parse(snippet);
          results.push(parsed);
        } catch (error) {
          console.warn("要約JSONの部分解析に失敗しました:", error);
        }
        objectStart = -1;
      }
    }
  }

  return results.length ? results : null;
}

function deduplicateSentences(sentences: SummarySentence[]): SummarySentence[] {
  const seen = new Set<string>();
  const result: SummarySentence[] = [];

  for (const sentence of sentences) {
    const normalizedText = sentence.text.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      continue;
    }
    if (seen.has(normalizedText)) {
      continue;
    }
    seen.add(normalizedText);
    const citations = Array.from(new Set(sentence.citations))
      .filter((id) => Number.isInteger(id))
      .map((id) => Number(id))
      .slice(0, 2)
      .sort((a, b) => a - b);
    result.push({
      text: normalizedText,
      citations
    });
  }

  return result;
}

function expandSummarySentences(sentences: SummarySentence[]): SummarySentence[] {
  const result: SummarySentence[] = [];
  const splitter = /(?<=[。！？!?])\s*/g;

  for (const sentence of sentences) {
    const fragments = sentence.text
      .split(splitter)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);

    if (!fragments.length) {
      continue;
    }

    if (fragments.length === 1) {
      result.push(sentence);
      continue;
    }

    for (const fragment of fragments) {
      result.push({
        text: fragment,
        citations: Array.from(new Set(sentence.citations)).sort((a, b) => a - b)
      });
    }
  }

  return deduplicateSentences(result);
}

function fillMissingCitations(sentences: SummarySentence[], entries: EntryRecord[]): SummarySentence[] {
  if (!sentences.length || !entries.length) {
    return sentences;
  }

  const entryIds = Array.from(new Set(entries.map((entry) => entry.id))).sort((a, b) => a - b);
  if (!entryIds.length) {
    return sentences;
  }
  const entryIdSet = new Set(entryIds);
  const lastEntryIndex = entryIds.length - 1;

  const result: SummarySentence[] = [];

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const existingCitations = Array.from(new Set(sentence.citations.filter((id) => entryIdSet.has(id))));
    if (existingCitations.length > 0) {
      result.push({
        text: sentence.text,
        citations: existingCitations.sort((a, b) => a - b)
      });
      continue;
    }

    let fallbackId: number | null = null;

    for (let prev = result.length - 1; prev >= 0; prev -= 1) {
      const citations = result[prev]?.citations ?? [];
      if (citations.length > 0) {
        fallbackId = citations[citations.length - 1];
        break;
      }
    }

    if (fallbackId === null) {
      for (let next = index + 1; next < sentences.length; next += 1) {
        const citations = sentences[next]?.citations ?? [];
        if (citations.length > 0) {
          const valid = citations.find((id) => entryIdSet.has(id));
          if (typeof valid === "number") {
            fallbackId = valid;
            break;
          }
        }
      }
    }

    if (fallbackId === null) {
      const ratio = sentences.length > 1 ? index / (sentences.length - 1) : 0;
      const approxIndex = Math.max(0, Math.min(lastEntryIndex, Math.round(ratio * lastEntryIndex)));
      fallbackId = entryIds[approxIndex] ?? entryIds[0];
    }

    result.push({
      text: sentence.text,
      citations: typeof fallbackId === "number" ? [fallbackId] : []
    });
  }

  return result;
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
