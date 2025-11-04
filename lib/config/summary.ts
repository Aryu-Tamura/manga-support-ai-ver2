export const SUMMARY_GRAIN_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 50);

export const DEFAULT_SUMMARY_GRAIN = SUMMARY_GRAIN_OPTIONS.includes(200)
  ? 200
  : SUMMARY_GRAIN_OPTIONS[0] ?? 200;

export const MAX_CONTEXT_CHARS = 0;
export const SUMMARY_ENTRY_CONTEXT_LENGTH = 220;
