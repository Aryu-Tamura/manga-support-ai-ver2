import { generateOverallSummaryFromText, generateEntrySummary } from "@/lib/summary/service";
import { extractCharactersFromText } from "@/lib/characters/service";
import { relabelTextWithLLM } from "@/lib/projects/relabel";

type PipelineInput = {
  title: string;
  fullText: string;
  styleHint: string;
  chunkTarget?: number;
};

type PipelineOutput = {
  summary: string;
  entries: unknown[];
  characters: unknown[];
};

const MAX_ENTRIES = 200;

export async function runUploadPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { title, fullText, styleHint, chunkTarget = 250 } = input;
  const cleaned = fullText.trim();
  if (!cleaned) {
    throw new Error("本文が空のためプロジェクトを生成できません。");
  }

  const relabeled = await relabelTextWithLLM({
    fullText: cleaned,
    styleHint,
    chunkTarget
  });
  const limitedEntries = relabeled.slice(0, MAX_ENTRIES);
  const entries = await Promise.all(
    limitedEntries.map(async (entry) => ({
      ...entry,
      summary: entry.summary?.trim()
        ? entry.summary
        : await generateEntrySummary(entry.text)
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
