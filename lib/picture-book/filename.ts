const FALLBACK_PROJECT_TITLE = "picture-book";
const MAX_FILENAME_LENGTH = 60;

export function buildExportFilename(baseTitle: string, projectKey: string, extension: string): string {
  const trimmed = baseTitle?.trim() || projectKey?.trim() || FALLBACK_PROJECT_TITLE;
  const safe = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const truncated = safe.slice(0, MAX_FILENAME_LENGTH) || FALLBACK_PROJECT_TITLE;
  return `${truncated}.${extension}`;
}
