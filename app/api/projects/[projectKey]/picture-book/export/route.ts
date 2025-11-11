import { NextResponse, type NextRequest } from "next/server";

import {
  buildPictureBookExport,
  type PictureBookExportFormat,
  type PictureBookExportPage
} from "@/lib/picture-book/exporters";
import { buildExportFilename } from "@/lib/picture-book/filename";
import { PICTURE_BOOK_PHASES, type PictureBookPhase } from "@/lib/picture-book/utils";

export const runtime = "nodejs";

type ExportRequestBody = {
  format?: PictureBookExportFormat;
  projectTitle?: string;
  pages?: PictureBookExportPage[];
};

const PHASE_SET = new Set<PictureBookPhase>(PICTURE_BOOK_PHASES);

export async function POST(
  request: NextRequest,
  context: { params: { projectKey: string } }
): Promise<NextResponse> {
  const { projectKey } = context.params;
  if (!projectKey) {
    return NextResponse.json(
      { ok: false, message: "プロジェクトキーが指定されていません。" },
      { status: 400 }
    );
  }

  let payload: ExportRequestBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "リクエスト形式が不正です。" },
      { status: 400 }
    );
  }

  const format = payload.format;
  if (format !== "docx" && format !== "pdf") {
    return NextResponse.json(
      { ok: false, message: "対応していない出力形式です。" },
      { status: 400 }
    );
  }

  const rawPages = Array.isArray(payload.pages) ? payload.pages : [];
  if (!rawPages.length) {
    return NextResponse.json(
      { ok: false, message: "エクスポート対象のページがありません。" },
      { status: 400 }
    );
  }

  const pages = sanitizePages(rawPages);
  if (!pages.length) {
    return NextResponse.json(
      { ok: false, message: "ページ情報が不正です。" },
      { status: 400 }
    );
  }

  try {
    const result = await buildPictureBookExport(format, {
      pages,
      projectKey,
      projectTitle: payload.projectTitle ?? projectKey
    });

    const body = Buffer.from(result.buffer);
    const filename =
      result.filename || buildExportFilename(payload.projectTitle ?? "", projectKey, format);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": buildContentDisposition(filename)
      }
    });
  } catch (error) {
    console.error("絵本エクスポートに失敗しました:", error);
    return NextResponse.json(
      { ok: false, message: "エクスポート処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}

function sanitizePages(pages: PictureBookExportPage[]): PictureBookExportPage[] {
  return pages
    .map((page, index) => {
      if (!page || typeof page !== "object") {
        return null;
      }
      const phase = PHASE_SET.has(page.phase as PictureBookPhase) ? page.phase : null;
      const pageNumber =
        typeof page.pageNumber === "number" && Number.isFinite(page.pageNumber)
          ? page.pageNumber
          : index + 1;
      if (!phase) {
        return null;
      }
      const narration =
        typeof page.narration === "string" ? page.narration : "ナレーション未入力";
      const dialogues = Array.isArray(page.dialogues)
        ? page.dialogues
            .map((line) => (typeof line === "string" ? line : ""))
            .filter((line) => line.length > 0)
        : [];
      const imageUrl =
        typeof page.imageUrl === "string" && page.imageUrl.trim().length > 0
          ? page.imageUrl
          : null;

      return {
        pageNumber,
        phase,
        narration,
        dialogues,
        imageUrl
      };
    })
    .filter((page): page is PictureBookExportPage => Boolean(page));
}

function buildContentDisposition(filename: string): string {
  const encoded = encodeRFC5987ValueChars(filename);
  return `attachment; filename*=UTF-8''${encoded}`;
}

function encodeRFC5987ValueChars(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}
