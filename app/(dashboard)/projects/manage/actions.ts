"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  deleteProject,
  updateProjectMetadata,
  registerNewProject,
  overwriteProjectData
} from "@/lib/projects/persistence";
import { SAMPLE_PROJECT_KEYS } from "@/lib/projects/constants";
import { saveUploadFile } from "@/lib/uploads/storage";
import { generateProjectKey } from "@/lib/projects/keys";
import { runUploadPipeline } from "@/lib/projects/upload-pipeline";
import { recordAuditEvent } from "@/lib/telemetry/audit";
import { logError, logInfo } from "@/lib/logging/logger";
import { getProjectByKey } from "@/lib/projects/repository";
import path from "node:path";

const UpdateSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1, "タイトルを入力してください。"),
  summary: z.string().optional().default("")
});

export type UpdateProjectActionResponse =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateProjectMetadataAction(
  payload: z.infer<typeof UpdateSchema>
): Promise<UpdateProjectActionResponse> {
  const parsed = UpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "入力内容を確認してください。" };
  }
  const { key, title, summary } = parsed.data;
  try {
    if (SAMPLE_PROJECT_KEYS.has(key)) {
      return { ok: false, message: "サンプルプロジェクトは編集できません。" };
    }
    await updateProjectMetadata({ key, title, summary });
    recordAuditEvent({
      action: "project.update",
      actor: "admin",
      severity: "info",
      message: `プロジェクト「${title}」を更新しました。`,
      meta: { key }
    });
    logInfo("Project metadata updated", { key });
    revalidatePath("/projects/manage");
    revalidatePath("/projects");
    revalidatePath(`/projects/${key}/summary`);
    return { ok: true, message: "プロジェクト情報を更新しました。" };
  } catch (error) {
    logError("プロジェクトの更新に失敗", { key, error: String(error) });
    recordAuditEvent({
      action: "project.update",
      actor: "admin",
      severity: "error",
      message: "プロジェクト更新中にエラーが発生しました。",
      meta: { key }
    });
    return { ok: false, message: "更新中にエラーが発生しました。" };
  }
}

const DeleteSchema = z.object({
  key: z.string().min(1)
});

export type DeleteProjectActionResponse =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deleteProjectAction(
  payload: z.infer<typeof DeleteSchema>
): Promise<DeleteProjectActionResponse> {
  const parsed = DeleteSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "削除対象の指定が不正です。" };
  }
  const { key } = parsed.data;
  try {
    if (SAMPLE_PROJECT_KEYS.has(key)) {
      return { ok: false, message: "サンプルプロジェクトは削除できません。" };
    }
    await deleteProject(key);
    recordAuditEvent({
      action: "project.delete",
      actor: "admin",
      severity: "warning",
      message: `プロジェクト(${key})を削除しました。`,
      meta: { key }
    });
    logInfo("Project deleted", { key });
    revalidatePath("/projects/manage");
    revalidatePath("/projects");
    return { ok: true, message: "プロジェクトを削除しました。" };
  } catch (error) {
    logError("プロジェクトの削除に失敗", { key, error: String(error) });
    recordAuditEvent({
      action: "project.delete",
      actor: "admin",
      severity: "error",
      message: "プロジェクト削除中にエラーが発生しました。",
      meta: { key }
    });
    return { ok: false, message: "削除中にエラーが発生しました。" };
  }
}

const UploadSchema = z.object({
  title: z.string().min(1),
  styleHint: z.string().optional().default(""),
  chunkTarget: z.number().int().min(80).max(600).optional()
});

export type UploadProjectActionResponse =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function createProjectFromUploadAction(
  formData: FormData
): Promise<UploadProjectActionResponse> {
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const styleHint = String(formData.get("styleHint") ?? "").trim();
  const chunkTargetValue = Number(formData.get("chunkTarget") ?? "");

  const parsed = UploadSchema.safeParse({
    title,
    styleHint,
    chunkTarget: Number.isFinite(chunkTargetValue) ? chunkTargetValue : undefined
  });
  if (!parsed.success) {
    return { ok: false, message: "作品タイトルを入力してください。" };
  }

  if (!(file instanceof File)) {
    return { ok: false, message: "原作ファイルが選択されていません。" };
  }

  try {
    const saved = await saveUploadFile(file);
    const rawText = (await file.text()).trim();
    if (!rawText) {
      return { ok: false, message: "ファイルの本文が空でした。別のファイルでお試しください。" };
    }

    logInfo("Upload pipeline started", { title: parsed.data.title, file: saved.fileName });
    const pipeline = await runUploadPipeline({
      title: parsed.data.title,
      fullText: rawText,
      styleHint: parsed.data.styleHint,
      chunkTarget: parsed.data.chunkTarget ?? 250
    });
    const key = await generateProjectKey(parsed.data.title);
    const projectDir = path.join(process.cwd(), "Streamlit", "data", key);
    const panelPath = path.join(projectDir, "project.json");
    const characterPath = path.join(projectDir, "characters.json");

    await registerNewProject({
      key,
      title: parsed.data.title,
      summary: pipeline.summary,
      panelPath,
      characterPath,
      entries: pipeline.entries,
      fullText: rawText,
      characters: pipeline.characters
    });

    revalidatePath("/projects/manage");
    revalidatePath("/projects");
    revalidatePath(`/projects/${key}/summary`);
    revalidatePath(`/projects/${key}/characters`);
    revalidatePath(`/projects/${key}/plot`);
    revalidatePath(`/projects/${key}/validation`);

    recordAuditEvent({
      action: "project.upload",
      actor: "admin",
      severity: "info",
      message: `新規プロジェクト『${parsed.data.title}』を登録しました。`,
      meta: { key, sourceFile: saved.fileName, chunkTarget: parsed.data.chunkTarget ?? 250 }
    });
    logInfo("Upload pipeline completed", { key });
    return {
      ok: true,
      message: `『${parsed.data.title}』のアップロードを受け付けました（${saved.fileName} / チャンク目標 ${parsed.data.chunkTarget ?? 250}字）。解析済みデータを登録しました。`
    };
  } catch (error) {
    logError("アップロード処理でエラー", { title: parsed.data.title, error: String(error) });
    recordAuditEvent({
      action: "project.upload",
      actor: "admin",
      severity: "error",
      message: "アップロード処理中にエラーが発生しました。",
      meta: { title: parsed.data.title }
    });
    return { ok: false, message: "ファイルの保存中にエラーが発生しました。" };
  }
}

const RelabelSchema = z.object({
  key: z.string().min(1),
  styleHint: z.string().optional().default(""),
  chunkTarget: z.number().int().min(80).max(600).optional()
});

export type RelabelProjectActionResponse =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function relabelProjectAction(
  payload: z.infer<typeof RelabelSchema>
): Promise<RelabelProjectActionResponse> {
  const parsed = RelabelSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "パラメータが不正です。" };
  }
  const { key, styleHint, chunkTarget } = parsed.data;

  if (SAMPLE_PROJECT_KEYS.has(key)) {
    return { ok: false, message: "サンプルプロジェクトは再ラベルできません。" };
  }

  try {
    const project = await getProjectByKey(key);
    if (!project) {
      return { ok: false, message: "プロジェクトが見つかりません。" };
    }
    const baseText = (project.fullText || "").trim() || project.entries.map((entry) => entry.text).join("\n\n");
    if (!baseText.trim()) {
      return { ok: false, message: "本文が保存されていないため再ラベルできません。" };
    }

    logInfo("Relabel pipeline started", { key });
    const pipeline = await runUploadPipeline({
      title: project.title,
      fullText: baseText,
      styleHint,
      chunkTarget: chunkTarget ?? 250
    });

    await overwriteProjectData({
      key,
      summary: pipeline.summary,
      entries: pipeline.entries,
      fullText: baseText,
      characters: pipeline.characters,
      title: project.title
    });

    revalidatePath("/projects/manage");
    revalidatePath("/projects");
    revalidatePath(`/projects/${key}/summary`);
    revalidatePath(`/projects/${key}/characters`);
    revalidatePath(`/projects/${key}/plot`);
    revalidatePath(`/projects/${key}/validation`);

    recordAuditEvent({
      action: "project.relabel",
      actor: "admin",
      severity: "info",
      message: `プロジェクト『${project.title}』を再ラベルしました。`,
      meta: { key, chunkTarget: chunkTarget ?? 250 }
    });
    logInfo("Relabel pipeline completed", { key });

    return {
      ok: true,
      message: `本文を再解析し、チャンク情報を更新しました（チャンク目標 ${chunkTarget ?? 250}字）。`
    };
  } catch (error) {
    logError("再ラベル処理でエラー", { key, error: String(error) });
    recordAuditEvent({
      action: "project.relabel",
      actor: "admin",
      severity: "error",
      message: "再ラベル処理中にエラーが発生しました。",
      meta: { key }
    });
    return { ok: false, message: "再ラベル処理でエラーが発生しました。" };
  }
}
