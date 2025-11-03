import { generateOverallSummaryFromText, generateEntrySummary } from "@/lib/summary/service";
import { extractCharactersFromText } from "@/lib/characters/service";
import { getOpenAIClient } from "@/lib/server/openai";

type PipelineInput = {
  title: string;
  fullText: string;
  styleHint: string;
};

type PipelineOutput = {
  summary: string;
  entries: unknown[];
  characters: unknown[];
};

const MAX_ENTRIES = 200;

export async function runUploadPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { title, fullText, styleHint } = input;
  const cleaned = fullText.trim();
  if (!cleaned) {
    throw new Error("本文が空のためプロジェクトを生成できません。");
  }

  const paragraphs = splitIntoParagraphs(cleaned).slice(0, MAX_ENTRIES);
  const client = getOpenAIClient();

  const llmEntryLimit = client ? 30 : 0;
  const entries = await Promise.all(
    paragraphs.map(async (text, index) => ({
      id: index + 1,
      text,
      type: "narration",
      speakers: [],
      time: "unknown",
      location: "",
      tone: "neutral",
      emotion: "neutral",
      action: "",
      entities: [],
      source_span: { start: -1, end: -1 },
      summary:
        index < llmEntryLimit
          ? await generateEntrySummary(text)
          : text.slice(0, 160) + (text.length > 160 ? "…" : "")
    }))
  );

  const summary = await generateOverallSummaryFromText(title, cleaned);
  const characters = await buildCharacters(cleaned, styleHint);

  return {
    summary,
    entries,
    characters
  };
}

function splitIntoParagraphs(text: string) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function buildCharacters(fullText: string, styleHint: string) {
  const chars = await extractCharactersFromText(fullText);
  if (styleHint.trim()) {
    chars.push({
      Name: "スタイルメモ",
      Role: "補足",
      Details: styleHint.trim()
    });
  }
  return dedupeCharacters(chars);
}

function dedupeCharacters(characters: unknown[]) {
  const seen = new Set<string>();
  const result: Array<{ Name: string; Role: string; Details: string }> = [];
  for (const item of characters) {
    if (!item || typeof item !== "object") continue;
    const record = item as { Name?: string; Role?: string; Details?: string };
    const name = (record.Name || "").trim();
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push({
      Name: name,
      Role: (record.Role || "").trim(),
      Details: (record.Details || "").trim()
    });
  }
  return result;
}
