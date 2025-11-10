import { promises as fs } from "fs";
import path from "path";

let cachedFont: Uint8Array | null = null;

const FONT_CANDIDATES = [
  process.env.PICTURE_BOOK_PDF_FONT_PATH ?? "",
  path.join(process.cwd(), "assets", "fonts", "NotoSansJP-Regular.ttf"),
  "/Library/Fonts/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
];

export async function getPictureBookPdfFontData(): Promise<Uint8Array> {
  if (cachedFont) {
    return cachedFont;
  }

  for (const candidate of FONT_CANDIDATES) {
    if (!candidate || candidate.trim().length === 0) {
      continue;
    }
    try {
      const data = await fs.readFile(candidate);
      cachedFont = new Uint8Array(data);
      return cachedFont;
    } catch {
      continue;
    }
  }

  throw new Error(
    "PDF用フォントを読み込めませんでした。PICTURE_BOOK_PDF_FONT_PATH で TrueType フォントを指定してください。"
  );
}
