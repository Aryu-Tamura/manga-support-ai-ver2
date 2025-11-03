import type { EntryRecord } from "@/lib/projects/types";
import { DEFAULT_BLOCK_WINDOW } from "@/lib/config/validation";

export type ValidationBlock = {
  entryId: number;
  order: number;
  summary: string;
  text: string;
};

export function buildInitialBlocks(
  entries: EntryRecord[],
  start: number,
  end: number
): ValidationBlock[] {
  const selected = entries.filter((entry) => entry.id >= start && entry.id <= end);
  return selected.map((entry, index) => ({
    entryId: entry.id,
    order: index + 1,
    summary: entry.summary?.trim() || truncateText(entry.text, 160),
    text: entry.text
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

function truncateText(text: string, limit: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}…`;
}
