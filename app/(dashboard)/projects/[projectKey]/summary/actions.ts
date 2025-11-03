"use server";

import { z } from "zod";
import { getProjectByKey } from "@/lib/projects/repository";
import { generateSummary } from "@/lib/summary/service";

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

  return {
    ok: true,
    summary: result.summary,
    citations: result.citations,
    mode: result.mode
  };
}
