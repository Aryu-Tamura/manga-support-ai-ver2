export const VALIDATION_TARGET_LENGTHS = Array.from(
  { length: 40 },
  (_, index) => (index + 1) * 50
);

export const DEFAULT_VALIDATION_TARGET_LENGTH = VALIDATION_TARGET_LENGTHS.includes(300)
  ? 300
  : VALIDATION_TARGET_LENGTHS[0];

export const DEFAULT_BLOCK_WINDOW = 5;
