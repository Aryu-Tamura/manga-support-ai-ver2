import type { ProjectData } from "@/lib/projects/types";

export type BasicInfoData = {
  title: string;
  genre: string;
  synopsis: string;
  world: string;
  source: "data" | "sample";
};

const GENRE_KEYWORDS: Record<string, string[]> = {
  ファンタジー: ["魔法", "異世界", "王国", "ダンジョン"],
  学園: ["学園", "学校", "クラス", "文化祭"],
  ミステリー: ["事件", "捜査", "犯人", "推理"],
  SF: ["宇宙", "未来", "テクノロジー", "機械"],
  恋愛: ["恋", "告白", "恋人", "ラブ"]
};

export function buildBasicInfo(project: ProjectData): BasicInfoData {
  const summaryText = (project.summary ?? "").trim();
  const sentences = (project.summarySentences ?? []).map((sentence) => sentence.text.trim()).filter(Boolean);
  const synopsis = buildSynopsis(summaryText, sentences);
  const world = buildWorldContext(sentences);

  return {
    title: project.title,
    genre: detectGenre(summaryText),
    synopsis,
    world,
    source: summaryText.length > 0 ? "data" : "sample"
  };
}

function buildSynopsis(summary: string, sentences: string[], maxLength = 200) {
  const base = summary || sentences.slice(0, 3).join(" ");
  if (!base.trim()) {
    return "作品の概要情報がまだ揃っていません。要約を生成するとここに表示されます。";
  }
  if (base.length <= maxLength) {
    return base;
  }
  return `${base.slice(0, maxLength).trim()}…`;
}

function buildWorldContext(sentences: string[]) {
  const focus = sentences.slice(3, 6).join(" ");
  if (focus.trim()) {
    return focus;
  }
  return "世界観や舞台設定の情報を収集中です。物語の背景がまとまり次第ここに表示されます。";
}

function detectGenre(text: string) {
  if (!text) {
    return "未分類";
  }
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return genre;
    }
  }
  return "未分類";
}
