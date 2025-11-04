"use server";

import { z } from "zod";
import { getProjectByKey } from "@/lib/projects/repository";
import {
  generateSummaryVariations,
  generateReconstructedSummary
} from "@/lib/validation/service";

const VariationSchema = z.object({
  summary: z.string().min(1),
  customPrompt: z.string().optional().default(""),
  citations: z.array(z.number().int()).optional().default([])
});

export type VariationActionResponse =
  | {
      ok: true;
      variations: { variant: string; note: string }[];
      mode: "llm" | "sample";
    }
  | {
      ok: false;
      message: string;
    };

export async function generateSummaryVariationsAction(
  payload: z.infer<typeof VariationSchema>
): Promise<VariationActionResponse> {
  const parsed = VariationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "文章の入力が不足しています。" };
  }
  const result = await generateSummaryVariations(parsed.data);
  return {
    ok: true,
    variations: result.variations,
    mode: result.mode
  };
}

const ReconSchema = z.object({
  projectKey: z.string().min(1),
  blocks: z
    .array(
      z.object({
        id: z.number().int(),
        summary: z.string().min(1),
        citations: z.array(z.number().int()).optional().default([])
      })
    )
    .min(1),
  targetLength: z.number().int().min(50).max(2000)
});

export type ReconstructionActionResponse =
  | {
      ok: true;
      summary: string;
      mode: "llm" | "sample";
    }
  | {
      ok: false;
      message: string;
    };

export async function generateReconstructedSummaryAction(
  payload: z.infer<typeof ReconSchema>
): Promise<ReconstructionActionResponse> {
  const parsed = ReconSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "再構成の入力値が不正です。" };
  }

  const project = await getProjectByKey(parsed.data.projectKey);
  if (!project) {
    return { ok: false, message: "プロジェクトが見つかりません。" };
  }

  const result = await generateReconstructedSummary({
    project,
    blocks: parsed.data.blocks,
    targetLength: parsed.data.targetLength
  });

  return {
    ok: true,
    summary: result.summary,
    mode: result.mode
  };
}
