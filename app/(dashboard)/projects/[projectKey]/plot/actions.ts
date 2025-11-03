"use server";

import { z } from "zod";
import { getProjectByKey } from "@/lib/projects/repository";
import { generatePlotScript } from "@/lib/plot/service";
import { createPlotDocx } from "@/lib/plot/docx";

const GeneratePlotSchema = z.object({
  projectKey: z.string().min(1),
  start: z.number().int().min(1),
  end: z.number().int().min(1)
});

export type GeneratePlotActionInput = z.infer<typeof GeneratePlotSchema>;

export type GeneratePlotActionResult =
  | { ok: true; script: string; mode: "llm" | "sample"; citations: number[] }
  | { ok: false; message: string };

export async function generatePlotAction(
  payload: GeneratePlotActionInput
): Promise<GeneratePlotActionResult> {
  const parsed = GeneratePlotSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "プロット生成の入力値が不正です。" };
  }

  const { projectKey, start, end } = parsed.data;
  const project = await getProjectByKey(projectKey);
  if (!project) {
    return { ok: false, message: "プロジェクトが見つかりません。" };
  }

  const maxId = project.entries.length;
  if (maxId === 0) {
    return { ok: false, message: "チャンクデータがありません。" };
  }

  const clampedStart = Math.max(1, Math.min(start, maxId));
  const clampedEnd = Math.max(clampedStart, Math.min(end, maxId));
  const entries = project.entries.filter(
    (entry) => entry.id >= clampedStart && entry.id <= clampedEnd
  );

  const result = await generatePlotScript({
    project,
    entries,
    characters: project.characters
  });

  return {
    ok: true,
    script: result.script,
    mode: result.mode,
    citations: entries.map((entry) => entry.id)
  };
}

const PlotDocxSchema = z.object({
  script: z.string().min(1)
});

export type PlotDocxActionInput = z.infer<typeof PlotDocxSchema>;

export type PlotDocxActionResult =
  | { ok: true; base64: string; mime: string }
  | { ok: false; message: string };

export async function generatePlotDocxAction(
  payload: PlotDocxActionInput
): Promise<PlotDocxActionResult> {
  const parsed = PlotDocxSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "DOCX 生成の入力値が不正です。" };
  }

  try {
    const content = await createPlotDocx(parsed.data.script);
    const base64 = Buffer.from(content).toString("base64");
    return {
      ok: true,
      base64,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
  } catch (error) {
    console.error("DOCX生成に失敗しました:", error);
    return { ok: false, message: "DOCX の生成中にエラーが発生しました。" };
  }
}
