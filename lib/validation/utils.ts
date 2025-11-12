import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import { DEFAULT_BLOCK_WINDOW } from "@/lib/config/validation";

const TITLE_SETS: Record<string, string[]> = {
  project1: [
    "夜空に灯る願い",
    "友との約束",
    "銀河鉄道の軌跡",
    "幻想的な停車駅",
    "星明りの祈り",
    "旅路の分岐点",
    "静寂の会話",
    "車窓を流れる思い出",
    "別れを告げるベル",
    "夢へ続くレール"
  ],
  project2: [
    "裏切りの瞬間",
    "ギフト覚醒",
    "復讐の決意",
    "無限ガチャ起動",
    "仲間再編計画",
    "脱出の布石",
    "圧倒的な反撃",
    "世界へ響くざまぁ",
    "王国構想の始動",
    "怒りの炎"
  ]
};
const TITLE_ALIAS: Record<string, string> = {
  project: "project2"
};
const FALLBACK_TITLE = "シーンハイライト";

export type ValidationBlock = {
  blockId: string;
  entryId: number;
  order: number;
  originalOrder: number;
  summary: string;
  title: string;
  citations: number[];
  text: string;
};

type InternalBlock = ValidationBlock & {
  anchor: number;
  sequence: number;
};

export function buildInitialBlocks(
  projectKey: string,
  sentences: SummarySentence[],
  entries: EntryRecord[],
  start: number,
  end: number
): ValidationBlock[] {
  const titlePicker = createTitlePicker(projectKey);

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
      originalOrder: index + 1,
      summary: entry.summary?.trim() || entry.text.trim(),
      title: titlePicker.pick(),
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
        originalOrder: index + 1,
        title: titlePicker.pick(),
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
      originalOrder: sentenceBlocks.length + index + 1,
      title: titlePicker.pick(),
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
      originalOrder: block.originalOrder,
      summary: block.summary,
      title: block.title,
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

function createTitlePicker(projectKey: string) {
  const mappedKey = TITLE_SETS[projectKey]
    ? projectKey
    : TITLE_ALIAS[projectKey] ?? projectKey;
  const titles = TITLE_SETS[mappedKey] ?? [];
  let counter = 0;
  return {
    pick() {
      const title = counter < titles.length ? titles[counter] : FALLBACK_TITLE;
      counter += 1;
      return title || FALLBACK_TITLE;
    }
  };
}
