import fontkit from "@pdf-lib/fontkit";
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { PictureBookPage } from "@/lib/picture-book/utils";

import { buildExportFilename } from "./filename";
import { getPictureBookPdfFontData } from "./pdf-font";

export type PictureBookExportFormat = "docx" | "pdf";

export type PictureBookExportPage = Pick<
  PictureBookPage,
  "pageNumber" | "phase" | "narration" | "dialogues" | "imageUrl"
>;

export type PictureBookExportOptions = {
  pages: PictureBookExportPage[];
  projectKey: string;
  projectTitle: string;
};

export type PictureBookExportResult = {
  buffer: Uint8Array;
  filename: string;
  contentType: string;
};

export async function buildPictureBookExport(
  format: PictureBookExportFormat,
  options: PictureBookExportOptions
): Promise<PictureBookExportResult> {
  if (format === "docx") {
    return createDocxExport(options);
  }
  if (format === "pdf") {
    return createPdfExport(options);
  }
  throw new Error(`Unsupported export format: ${format}`);
}

async function createDocxExport(options: PictureBookExportOptions): Promise<PictureBookExportResult> {
  const { pages, projectKey, projectTitle } = options;
  if (!pages.length) {
    throw new Error("エクスポートできるページがありません。");
  }

  const sectionChildren: Paragraph[] = [];
  const titleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: `${projectTitle || projectKey || "絵本ドラフト"}`,
        bold: true,
        size: 32
      })
    ]
  });
  sectionChildren.push(titleParagraph);

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const narration = (page.narration ?? "").trim() || "ナレーション未入力";
    const dialogues = page.dialogues.map((line) => line.trim()).filter((line) => line.length > 0);

    const heading = new Paragraph({
      pageBreakBefore: index > 0,
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: `Page ${page.pageNumber} ｜ ${page.phase}`,
          bold: true
        })
      ]
    });
    sectionChildren.push(heading);

    if (page.imageUrl) {
      const buffer = await fetchImageBuffer(page.imageUrl);
      if (buffer) {
        const imageData = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        const image = new ImageRun({
          data: imageData,
          transformation: {
            width: 400,
            height: 400
          }
        });
        sectionChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [image]
          })
        );
      } else {
        sectionChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: "画像を取得できませんでした。", italics: true })]
          })
        );
      }
    } else {
      sectionChildren.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: "画像未生成", italics: true })]
        })
      );
    }

    sectionChildren.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "ナレーション", bold: true })]
      })
    );
    sectionChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: narration })]
      })
    );

    if (dialogues.length) {
      sectionChildren.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: "セリフ", bold: true })]
        })
      );
      dialogues.forEach((line) => {
        sectionChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun(line)]
          })
        );
      });
    }
  }

  const document = new Document({
    creator: "Manga Support AI",
    description: "絵本化タブで生成した内容をWord形式に出力したドキュメントです。",
    title: `${projectTitle || projectKey || "絵本"} - Picture Book`,
    sections: [{ children: sectionChildren }]
  });

  const docBuffer = await Packer.toBuffer(document);
  return {
    buffer: new Uint8Array(docBuffer),
    filename: buildExportFilename(projectTitle, projectKey, "docx"),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
}

async function createPdfExport(options: PictureBookExportOptions): Promise<PictureBookExportResult> {
  const { pages, projectKey, projectTitle } = options;
  if (!pages.length) {
    throw new Error("エクスポートできるページがありません。");
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontData = await getPictureBookPdfFontData();
  const font = await pdfDoc.embedFont(fontData, { subset: true });
  const titleFontSize = 14;
  const bodyFontSize = 12;
  const margin = 48;
  const maxImageWidth = 480;
  const minTextAreaHeight = 320;

  for (const page of pages) {
    const pdfPage = pdfDoc.addPage();
    const { width, height } = pdfPage.getSize();
    let cursorY = height - margin;

    pdfPage.drawText(`Page ${page.pageNumber} ｜ ${page.phase}`, {
      x: margin,
      y: cursorY,
      size: titleFontSize,
      font,
      color: rgb(0.12, 0.12, 0.12)
    });
    cursorY -= titleFontSize + 8;

    let imageDrawn = false;
    if (page.imageUrl) {
      const buffer = await fetchImageBuffer(page.imageUrl);
      if (buffer) {
        const embedded = await embedImage(pdfDoc, buffer);
        if (embedded) {
          const contentWidth = width - margin * 2;
          const availableWidth = Math.min(maxImageWidth, contentWidth);
          const availableHeight = height - margin * 2;
          const maxImageHeight = Math.max(
            160,
            Math.min(availableHeight - minTextAreaHeight, availableHeight * 0.45)
          );
          const widthScale = Math.min(availableWidth / embedded.width, 1);
          const heightScale = Math.min(maxImageHeight / embedded.height, 1);
          const scale = Math.min(widthScale, heightScale);
          const scaled = {
            width: embedded.width * scale,
            height: embedded.height * scale
          };
          const imageX = margin + (contentWidth - scaled.width) / 2;
          const imageY = cursorY - scaled.height;
          pdfPage.drawImage(embedded, {
            x: imageX,
            y: imageY,
            width: scaled.width,
            height: scaled.height
          });
          cursorY = imageY - 12;
          imageDrawn = true;
        }
      }
    }

    if (!imageDrawn) {
      pdfPage.drawText("画像未生成", {
        x: margin,
        y: cursorY,
        size: bodyFontSize,
        font,
        color: rgb(0.3, 0.3, 0.3)
      });
      cursorY -= bodyFontSize + 12;
    }

    const narrationText = (page.narration ?? "").trim() || "ナレーション未入力";
    cursorY = drawLabeledBlock(pdfPage, "ナレーション", narrationText, {
      cursorY,
      font,
      fontSize: bodyFontSize,
      margin
    });

    const dialogues = page.dialogues.map((line) => line.trim()).filter((line) => line.length > 0);
    if (dialogues.length) {
      cursorY = drawLabeledBlock(pdfPage, "セリフ", dialogues.join("\n"), {
        cursorY,
        font,
        fontSize: bodyFontSize,
        margin,
        bullet: true
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    buffer: pdfBytes,
    filename: buildExportFilename(projectTitle, projectKey, "pdf"),
    contentType: "application/pdf"
  };
}

async function fetchImageBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("画像の取得に失敗しました:", url, response.status);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.warn("画像取得時にエラーが発生しました:", url, error);
    return null;
  }
}

async function embedImage(pdfDoc: PDFDocument, buffer: ArrayBuffer): Promise<PDFImage | null> {
  const uint8 = new Uint8Array(buffer);
  try {
    return await pdfDoc.embedPng(uint8);
  } catch {
    try {
      return await pdfDoc.embedJpg(uint8);
    } catch (error) {
      console.warn("PDFへの画像埋め込みに失敗しました:", error);
      return null;
    }
  }
}

type DrawOptions = {
  cursorY: number;
  font: PDFFont;
  fontSize: number;
  margin: number;
  bullet?: boolean;
};

function drawLabeledBlock(
  page: PDFPage,
  label: string,
  content: string,
  options: DrawOptions
): number {
  const { cursorY, font, fontSize, margin, bullet } = options;
  let currentY = cursorY;
  const maxWidth = page.getWidth() - margin * 2;
  const lineHeight = fontSize * 1.4;

  page.drawText(label, {
    x: margin,
    y: currentY,
    size: fontSize,
    font,
    color: rgb(0.1, 0.1, 0.1)
  });
  currentY -= lineHeight;

  const lines = wrapText(content, font, fontSize, maxWidth);
  lines.forEach((line) => {
    const text = bullet ? `・${line}` : line;
    page.drawText(text, {
      x: margin,
      y: currentY,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    currentY -= lineHeight;
  });

  return currentY - fontSize;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      return;
    }
    let currentLine = "";
    for (const char of trimmed) {
      const testLine = `${currentLine}${char}`;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = char;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  });
  return lines.length ? lines : [""];
}
