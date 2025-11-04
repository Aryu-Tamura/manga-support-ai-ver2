import type { EntryRecord, SummarySentence } from "@/lib/projects/types";

export const PICTURE_BOOK_PAGE_OPTIONS = [8, 12, 16, 24] as const;

export const PICTURE_BOOK_PHASES = ["起", "承", "転", "結"] as const;

export type PictureBookPhase = (typeof PICTURE_BOOK_PHASES)[number];

export type PictureBookPage = {
  id: string;
  pageNumber: number;
  phase: PictureBookPhase;
  imagePrompt: string;
  imageUrl: string | null;
  narration: string;
  dialogues: string[];
  citations: number[];
};

export function buildInitialPictureBookPages(
  sentences: SummarySentence[],
  entries: EntryRecord[],
  pageCount: number
): PictureBookPage[] {
  const normalisedSentences = sentences.filter((sentence) => sentence.text.trim().length > 0);
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const fallbackEntries = entries.filter((entry) => entry.text.trim().length > 0);

  const pages: PictureBookPage[] = [];
  const safeCount = Math.max(pageCount, 1);
  const sentenceCount = normalisedSentences.length;

  for (let index = 0; index < safeCount; index += 1) {
    const phase = pickPhaseForIndex(index, safeCount);
    const sentenceIndex =
      sentenceCount > 0
        ? Math.min(Math.floor((index / safeCount) * sentenceCount), sentenceCount - 1)
        : -1;
    const sentence = sentenceIndex >= 0 ? normalisedSentences[sentenceIndex] : null;

    const rawCitations = sentence?.citations ?? [];
    const citations = normaliseCitations(rawCitations);

    let narration = sentence?.text?.trim() ?? "";
    let primaryEntry = citations.length > 0 ? entryMap.get(citations[0]) ?? null : null;

    if (!narration) {
      const fallbackEntry =
        fallbackEntries[Math.min(index, Math.max(fallbackEntries.length - 1, 0))] ?? null;
      narration = fallbackEntry?.summary?.trim() || fallbackEntry?.text?.trim() || "";
      if (!primaryEntry) {
        primaryEntry = fallbackEntry;
      }
      if (fallbackEntry && citations.length === 0) {
        citations.push(fallbackEntry.id);
      }
    }

    if (!narration) {
      narration = "シーンの概要を入力してください。";
    }

    const dialogues = buildDialogueSnippets(citations, entryMap);

    pages.push({
      id: `page-${index + 1}`,
      pageNumber: index + 1,
      phase,
      imagePrompt: buildImagePrompt(phase, narration),
      imageUrl: null,
      narration,
      dialogues,
      citations
    });
  }

  return pages;
}

export function normaliseCitations(citations: number[]): number[] {
  const unique = new Set<number>();
  for (const raw of citations) {
    if (typeof raw !== "number" || Number.isNaN(raw)) {
      continue;
    }
    unique.add(Math.trunc(raw));
  }
  return Array.from(unique).sort((a, b) => a - b);
}

export function updatePageOrder(
  pages: PictureBookPage[],
  updater: (list: PictureBookPage[]) => PictureBookPage[]
): PictureBookPage[] {
  const next = updater([...pages]);
  return next.map((page, index) => ({
    ...page,
    pageNumber: index + 1
  }));
}

export function pickPhaseForIndex(index: number, pageCount: number): PictureBookPhase {
  const phases = PICTURE_BOOK_PHASES;
  const distribution = buildPhaseDistribution(pageCount);
  let cursor = 0;
  for (let phaseIndex = 0; phaseIndex < distribution.length; phaseIndex += 1) {
    const span = distribution[phaseIndex];
    const end = cursor + span;
    if (index < end) {
      return phases[phaseIndex];
    }
    cursor = end;
  }
  return phases[phases.length - 1];
}

export function buildPhaseDistribution(pageCount: number): number[] {
  const phases = PICTURE_BOOK_PHASES.length;
  const safeCount = Math.max(pageCount, phases);
  const base = Math.floor(safeCount / phases);
  const remainder = safeCount % phases;
  return Array.from({ length: phases }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildDialogueSnippets(
  citations: number[],
  entryMap: Map<number, EntryRecord>
): string[] {
  const snippets: string[] = [];
  for (const citation of citations) {
    const entry = entryMap.get(citation);
    if (!entry) {
      continue;
    }
    if (entry.speakers.length === 0 && entry.type !== "dialogue") {
      continue;
    }
    const speaker = entry.speakers[0] ?? "";
    const text = entry.text.replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    const truncated = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    snippets.push(speaker ? `${speaker}: ${truncated}` : truncated);
    if (snippets.length >= 2) {
      break;
    }
  }
  return snippets;
}

function buildImagePrompt(phase: PictureBookPhase, narration: string): string {
  const trimmed = narration.replace(/\s+/g, " ").trim();
  const summary = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  return `【${phase}】${summary || "シーンのイメージを入力"}`;
}
