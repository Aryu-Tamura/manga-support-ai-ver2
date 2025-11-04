"use server";

import { z } from "zod";
import { getProjectByKey } from "@/lib/projects/repository";
import { saveProjectSummaryResult } from "@/lib/projects/persistence";
import { generateSummary } from "@/lib/summary/service";
import type { SummarySentence } from "@/lib/projects/types";

const SummaryActionSchema = z.object({
  projectKey: z.string().min(1),
  start: z.number().int().min(1),
  end: z.number().int().min(1),
  grain: z.number().int().min(50)
});

export type SummaryActionInput = z.infer<typeof SummaryActionSchema>;

export type SummaryActionSuccess = {
  ok: true;
  summary: string;
  sentences: SummarySentence[];
  citations: number[];
  mode: "llm" | "sample";
};

export type SummaryActionError = {
  ok: false;
  message: string;
};

export type SummaryActionResponse = SummaryActionSuccess | SummaryActionError;

export async function generateSummaryAction(
  rawInput: SummaryActionInput
): Promise<SummaryActionResponse> {
  const input = SummaryActionSchema.safeParse(rawInput);
  if (!input.success) {
    return {
      ok: false,
      message: "要約生成パラメータが不正です。"
    };
  }

  const { projectKey, start, end, grain } = input.data;
  const project = await getProjectByKey(projectKey);
  if (!project) {
    return {
      ok: false,
      message: "プロジェクトが見つかりません。"
    };
  }

  const maxId = project.entries.length;
  const clampedStart = Math.max(1, Math.min(start, maxId));
  const clampedEnd = Math.max(clampedStart, Math.min(end, maxId));
  const slice = project.entries.filter(
    (entry) => entry.id >= clampedStart && entry.id <= clampedEnd
  );

  const result = await generateSummary({
    project,
    entries: slice,
    grain
  });

  try {
    await saveProjectSummaryResult({
      key: project.key,
      summary: result.summary,
      sentences: result.sentences,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("要約結果の保存に失敗しました:", error);
  }

  return {
    ok: true,
    summary: result.summary,
    sentences: result.sentences,
    citations: result.citations,
    mode: result.mode
  };
}
