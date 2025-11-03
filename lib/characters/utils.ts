import type { EntryRecord } from "@/lib/projects/types";

const CONTEXT_TEXT_LIMIT = 220;

export type CharacterContext = {
  id: number;
  text: string;
  summary?: string;
};

export function collectCharacterEntries(
  entries: EntryRecord[],
  name: string,
  limit = 12
): EntryRecord[] {
  const target = name.trim();
  if (!target) {
    return [];
  }
  const results: EntryRecord[] = [];
  for (const entry of entries) {
    const matchSpeaker = entry.speakers.some(
      (speaker) => speaker.toLowerCase() === target.toLowerCase()
    );
    const matchText =
      !matchSpeaker &&
      entry.text.toLowerCase().includes(target.toLowerCase());
    if (matchSpeaker || matchText) {
      results.push(entry);
      if (results.length >= limit) {
        break;
      }
    }
  }
  return results;
}

export function buildContextSnippets(entries: EntryRecord[]): CharacterContext[] {
  return entries.map((entry) => ({
    id: entry.id,
    text: truncateText(entry.text, CONTEXT_TEXT_LIMIT),
    summary: entry.summary
  }));
}

function truncateText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}…`;
}
