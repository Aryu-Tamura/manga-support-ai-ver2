import { promises as fs } from "node:fs";
import path from "node:path";

const INDEX_FILE = path.join(process.cwd(), "Streamlit", "data", "projects_index.json");

export async function generateProjectKey(title: string): Promise<string> {
  const normalized = (title || "project").trim().toLowerCase();
  const base = normalized.replace(/[^0-9a-z]+/g, "_").replace(/^_+|_+$/g, "") || "project";

  const existingKeys = await readExistingKeys();

  let candidate = base;
  let suffix = 1;
  while (existingKeys.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
}

async function readExistingKeys(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return new Set(data.map((item) => String(item.key || "")).filter(Boolean));
    }
  } catch (error) {
    console.warn("プロジェクトインデックスの読み込みに失敗しました:", error);
  }
  return new Set();
}
