export const SUMMARY_GRAIN_OPTIONS = Array.from({ length: 11 }, (_, index) => 500 + index * 50);

export const DEFAULT_SUMMARY_GRAIN = SUMMARY_GRAIN_OPTIONS.includes(700)
  ? 700
  : SUMMARY_GRAIN_OPTIONS[0] ?? 700;

export const MAX_CONTEXT_CHARS = 0;
export const SUMMARY_ENTRY_CONTEXT_LENGTH = 220;
