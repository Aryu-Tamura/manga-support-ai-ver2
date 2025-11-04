import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import { DEFAULT_BLOCK_WINDOW } from "@/lib/config/validation";

export type ValidationBlock = {
  blockId: string;
  entryId: number;
  order: number;
  summary: string;
  citations: number[];
  text: string;
};

export function buildInitialBlocks(
  sentences: SummarySentence[],
  entries: EntryRecord[],
  start: number,
  end: number
): ValidationBlock[] {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const filteredSentences = sentences.filter((sentence) =>
    sentence.citations.some((id) => id >= start && id <= end && entryMap.has(id))
  );

  if (filteredSentences.length === 0) {
    const selected = entries.filter((entry) => entry.id >= start && entry.id <= end);
    return selected.map((entry, index) => ({
      blockId: `entry-${entry.id}`,
      entryId: entry.id,
      order: index + 1,
      summary: entry.summary?.trim() || entry.text.trim(),
      citations: [entry.id],
      text: entry.text
    }));
  }

  return filteredSentences
    .map((sentence, index) => {
      const citations = sentence.citations.filter((id) => entryMap.has(id));
      if (citations.length === 0) {
        return null;
      }
      const primary = citations[0];
      const entry = entryMap.get(primary);
      return {
        blockId: `sentence-${index + 1}-${primary}`,
        entryId: primary,
        order: index + 1,
        summary: sentence.text,
        citations,
        text: entry?.text ?? ""
      };
    })
    .filter((block): block is ValidationBlock => block !== null);
}

export function defaultRange(entries: EntryRecord[]) {
  if (entries.length === 0) {
    return { start: 1, end: 1 };
  }
  const start = entries[0].id;
  const end = entries[Math.min(entries.length - 1, DEFAULT_BLOCK_WINDOW - 1)].id;
  return { start, end };
}