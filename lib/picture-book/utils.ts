import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import {
  PICTURE_BOOK_PHASES,
  type PictureBookPage,
  type PictureBookPhase
} from "./schema";

export const PICTURE_BOOK_PAGE_OPTIONS = [8, 12, 16] as const;
export const DEFAULT_PICTURE_BOOK_PAGE_COUNT = PICTURE_BOOK_PAGE_OPTIONS[0];
export { PICTURE_BOOK_PHASES };
export type { PictureBookPhase, PictureBookPage };

const MAX_NARRATION_LENGTH = 200;
const MAX_DIALOGUE_LENGTH = 100;

export function buildInitialPictureBookPages(
  sentences: SummarySentence[],
  entries: EntryRecord[],
  pageCount: number
): PictureBookPage[] {
  const normalisedSentences = sentences.filter((sentence) => sentence.text.trim().length > 0);
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const fallbackEntries = entries.filter((entry) => entry.text.trim().length > 0);
  const distributedEntryIds = distributeEntryIds(fallbackEntries, Math.max(pageCount, 1));

  const pages: PictureBookPage[] = [];
  const safeCount = Math.max(pageCount, 1);
  const sentenceCount = normalisedSentences.length;
  let previousNarration: string | null = null;

  for (let index = 0; index < safeCount; index += 1) {
    const phase = pickPhaseForIndex(index, safeCount);
    const sentenceIndex =
      sentenceCount > 0
        ? Math.min(Math.floor((index / safeCount) * sentenceCount), sentenceCount - 1)
        : -1;
    const sentence = sentenceIndex >= 0 ? normalisedSentences[sentenceIndex] : null;

    const rawCitations = sentence?.citations ?? [];
    const distributed = distributedEntryIds[index] ?? [];
    const citations = normaliseCitations([...rawCitations, ...distributed]);

    let narration = sentence?.text?.trim() ?? "";
    let primaryEntry = citations.length > 0 ? entryMap.get(citations[0]) ?? null : null;
    const derivedNarration = buildNarrationFromEntries(distributed, entryMap);

    if (!narration) {
      narration = derivedNarration;
    }

    if (previousNarration && derivedNarration && narration === previousNarration) {
      narration = derivedNarration;
    }

    if (!primaryEntry && distributed.length > 0) {
      primaryEntry = entryMap.get(distributed[0]) ?? null;
    }

    if (!narration) {
      narration = "シーンの概要を入力してください。";
    }

    narration = clampCharacters(narration, MAX_NARRATION_LENGTH);

    const dialogues = buildDialogueSnippets(citations, entryMap, distributed);

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

    previousNarration = narration;
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
  entryMap: Map<number, EntryRecord>,
  distributedEntryIds: number[]
): string[] {
  const snippets: string[] = [];
  const seen = new Set<string>();
  const orderedEntries = citations
    .map((id) => entryMap.get(id))
    .filter((entry): entry is EntryRecord => Boolean(entry));

  const pushDialogue = (line: string) => {
    if (!line || seen.has(line)) {
      return;
    }
    snippets.push(line);
    seen.add(line);
  };

  for (const entry of orderedEntries) {
    for (const dialogue of extractDialoguesFromEntry(entry)) {
      pushDialogue(dialogue);
      if (snippets.length >= 3) {
        return snippets.slice(0, 3);
      }
    }
  }

  if (snippets.length < 2) {
    const fallbackEntries = distributedEntryIds
      .map((id) => entryMap.get(id))
      .filter((entry): entry is EntryRecord => Boolean(entry));
    for (const entry of fallbackEntries) {
      for (const dialogue of buildFallbackDialogues(entry)) {
        pushDialogue(dialogue);
        if (snippets.length >= 3) {
          return snippets.slice(0, 3);
        }
      }
    }
  }

  return snippets.slice(0, 3);
}

export function buildImagePrompt(phase: PictureBookPhase, narration: string): string {
  const trimmed = narration.replace(/\s+/g, " ").trim();
  const summary = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  return `【${phase}】${summary || "シーンのイメージを入力"}`;
}

function distributeEntryIds(entries: EntryRecord[], pageCount: number): number[][] {
  if (entries.length === 0 || pageCount <= 0) {
    return Array.from({ length: Math.max(pageCount, 0) }, () => []);
  }
  const validIds = entries.map((entry) => entry.id);
  const groups: number[][] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const start = Math.floor((index * validIds.length) / pageCount);
    const end = Math.max(Math.floor(((index + 1) * validIds.length) / pageCount), start + 1);
    const slice = validIds.slice(start, Math.min(end, validIds.length));
    groups.push(slice.length > 0 ? slice : [validIds[validIds.length - 1]]);
  }
  return groups;
}

function buildNarrationFromEntries(entryIds: number[], entryMap: Map<number, EntryRecord>): string {
  const pieces = entryIds
    .map((id) => entryMap.get(id))
    .filter((entry): entry is EntryRecord => Boolean(entry))
    .map((entry) => entry.summary?.trim() || entry.text.replace(/\s+/g, " ").trim())
    .filter((value) => value && value.length > 0);
  if (pieces.length === 0) {
    return "";
  }
  const merged = pieces.join(" ");
  return clampCharacters(merged, MAX_NARRATION_LENGTH);
}

function extractDialoguesFromEntry(entry: EntryRecord): string[] {
  const normalisedText = entry.text.replace(/\s+/g, " ").trim();
  if (!normalisedText) {
    return [];
  }

  const results: string[] = [];
  const speakers = entry.speakers
    .map((speaker) => sanitizeSpeaker(speaker))
    .filter((speaker) => speaker.length > 0);
  const matches = Array.from(normalisedText.matchAll(/「([^」]{1,160})」/g));

  if (matches.length > 0) {
    matches.forEach((match, index) => {
      const raw = match[1]?.trim() ?? "";
      if (!raw) {
        return;
      }
      const speaker = speakers[index] ?? speakers[0] ?? "";
      results.push(formatDialogueLine(speaker, raw));
    });
  }

  if (results.length === 0) {
    const speaker = speakers[0] ?? "";
    results.push(formatDialogueLine(speaker, normalisedText));
  }

  return results;
}

function buildFallbackDialogues(entry: EntryRecord): string[] {
  const reference = entry.summary?.trim() || entry.text;
  const normalised = reference.replace(/\s+/g, " ").trim();
  if (!normalised) {
    return [];
  }
  const speaker = sanitizeSpeaker(entry.speakers[0] ?? "");
  const fragments = normalised
    .split(/[。！？!?]/)
    .map((fragment) => fragment.replace(/[「」『』]/g, "").trim())
    .filter((fragment) => fragment.length > 0)
    .slice(0, 3);
  if (fragments.length === 0) {
    return [];
  }
  return fragments.map((fragment) => formatDialogueLine(speaker, fragment));
}

function formatDialogueLine(speaker: string, content: string): string {
  const cleaned = content.replace(/[「」『』]/g, "").trim();
  if (!cleaned) {
    return "";
  }
  const limited = clampCharacters(cleaned, MAX_DIALOGUE_LENGTH);
  if (!speaker || speaker === "語り手") {
    return limited;
  }
  return `${speaker}「${limited}」`;
}

function sanitizeSpeaker(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase() === "unknown") {
    return "";
  }
  return trimmed;
}

export function clampCharacters(text: string, limit: number): string {
  if (!limit || limit <= 0) {
    return text;
  }
  const characters = Array.from(text);
  if (characters.length <= limit) {
    return text;
  }
  return characters.slice(0, limit).join("");
}
