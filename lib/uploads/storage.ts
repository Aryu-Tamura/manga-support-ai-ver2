import { promises as fs } from "node:fs";
import path from "node:path";

const UPLOAD_ROOT = path.join(process.cwd(), "tmp", "uploads");

export type SavedUpload = {
  path: string;
  fileName: string;
  originalName: string;
  size: number;
};

function sanitizeFileName(name: string) {
  const trimmed = name.trim() || "upload";
  return trimmed.replace(/[^0-9a-zA-Z._-]+/g, "_");
}

export async function saveUploadFile(file: File): Promise<SavedUpload> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });

  const safeName = sanitizeFileName(file.name || "upload.txt");
  const timestamp = Date.now();
  const fileName = `${timestamp}_${safeName}`;
  const targetPath = path.join(UPLOAD_ROOT, fileName);

  await fs.writeFile(targetPath, buffer);

  return {
    path: targetPath,
    fileName,
    originalName: file.name || safeName,
    size: buffer.length
  };
}
