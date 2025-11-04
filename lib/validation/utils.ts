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

type InternalBlock = ValidationBlock & {
  anchor: number;
  sequence: number;
};

export function buildInitialBlocks(
  sentences: SummarySentence[],
  entries: EntryRecord[],
  start: number,
  end: number
): ValidationBlock[] {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const rangeEntries = entries.filter((entry) => entry.id >= start && entry.id <= end);
  const filteredSentences = sentences.filter((sentence) =>
    sentence.citations.some((id) => id >= start && id <= end && entryMap.has(id))
  );

  if (filteredSentences.length === 0) {
    return rangeEntries.map((entry, index) => ({
      blockId: `entry-${entry.id}`,
      entryId: entry.id,
      order: index + 1,
      summary: entry.summary?.trim() || entry.text.trim(),
      citations: [entry.id],
      text: entry.text
    }));
  }

  const sentenceBlocks: InternalBlock[] = filteredSentences
    .map((sentence, index) => {
      const citations = sentence.citations.filter((id) => entryMap.has(id));
      if (citations.length === 0) {
        return null;
      }
      const inRangeAnchors = citations.filter((id) => id >= start && id <= end);
      const primary = inRangeAnchors.length > 0 ? inRangeAnchors[0] : citations[0];
      const entry = entryMap.get(primary);
      const anchor = inRangeAnchors.length > 0 ? Math.min(...inRangeAnchors) : primary;

      return {
        blockId: `sentence-${index + 1}-${primary}`,
        entryId: primary,
        order: index + 1,
        summary: sentence.text,
        citations,
        text: entry?.text ?? "",
        anchor,
        sequence: index
      };
    })
    .filter((block): block is InternalBlock => block !== null);

  const coveredEntryIds = new Set<number>();
  sentenceBlocks.forEach((block) => {
    coveredEntryIds.add(block.entryId);
    block.citations.forEach((citation) => {
      if (citation >= start && citation <= end) {
        coveredEntryIds.add(citation);
      }
    });
  });

  const fallbackBlocks: InternalBlock[] = rangeEntries
    .filter((entry) => !coveredEntryIds.has(entry.id))
    .map((entry, index) => ({
      blockId: `entry-${entry.id}`,
      entryId: entry.id,
      order: 0,
      summary: entry.summary?.trim() || entry.text.trim(),
      citations: [entry.id],
      text: entry.text,
      anchor: entry.id,
      sequence: sentenceBlocks.length + index
    }));

  return [...sentenceBlocks, ...fallbackBlocks]
    .sort((a, b) => {
      if (a.anchor === b.anchor) {
        return a.sequence - b.sequence;
      }
      return a.anchor - b.anchor;
    })
    .map((block, index) => ({
      blockId: block.blockId,
      entryId: block.entryId,
      order: index + 1,
      summary: block.summary,
      citations: block.citations,
      text: block.text
    }));
}

export function defaultRange(entries: EntryRecord[]) {
  if (entries.length === 0) {
    return { start: 1, end: 1 };
  }
  const start = entries[0].id;
  const end = entries[Math.min(entries.length - 1, DEFAULT_BLOCK_WINDOW - 1)].id;
  return { start, end };
}
