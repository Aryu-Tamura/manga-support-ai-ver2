"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { generatePictureBookImage } from "@/lib/picture-book/image-service";
import { generatePictureBookDraft } from "@/lib/picture-book/llm-generator";
import { DEFAULT_PICTURE_BOOK_PAGE_COUNT, buildInitialPictureBookPages, type PictureBookPage } from "@/lib/picture-book/utils";
import { PictureBookPageSchema } from "@/lib/picture-book/schema";
import { getProjectByKey } from "@/lib/projects/repository";
import { saveProjectPictureBookPages } from "@/lib/projects/persistence";

const GenerateImagePayloadSchema = z.object({
  projectKey: z.string().min(1),
  pageNumber: z.number().int().min(1),
  prompt: z.string().min(1, "画像プロンプトを入力してください。"),
  phase: z.string().min(1)
});

const GenerateDraftPayloadSchema = z.object({
  projectKey: z.string().min(1),
  pageCount: z.number().int().min(1).optional()
});

const SavePictureBookPayloadSchema = z.object({
  projectKey: z.string().min(1),
  pages: z.array(PictureBookPageSchema)
});

export type GeneratePictureBookImageResponse =
  | {
      ok: true;
      imageUrl: string;
      note: string;
      mode: "gemini" | "sample";
    }
  | {
      ok: false;
      message: string;
    };

export type GeneratePictureBookDraftResponse =
  | {
      ok: true;
      pages: PictureBookPage[];
      source: "llm" | "fallback";
    }
  | {
      ok: false;
      message: string;
    };

export type SavePictureBookPagesResponse =
  | { ok: true }
  | { ok: false; message: string };

export async function generatePictureBookImageAction(
  payload: z.infer<typeof GenerateImagePayloadSchema>
): Promise<GeneratePictureBookImageResponse> {
  const parsed = GenerateImagePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "画像生成リクエストの入力値が不正です。"
    };
  }

  try {
    const result = await generatePictureBookImage(parsed.data);
    if (!result.ok) {
      return {
        ok: false,
        message: result.message
      };
    }
    return {
      ok: true,
      imageUrl: result.imageUrl,
      note: result.note,
      mode: result.mode
    };
  } catch (error) {
    console.error("絵本化画像生成に失敗:", error);
    return {
      ok: false,
      message: "画像生成で予期しないエラーが発生しました。"
    };
  }
}

export async function generatePictureBookDraftAction(
  payload: z.infer<typeof GenerateDraftPayloadSchema>
): Promise<GeneratePictureBookDraftResponse> {
  const parsed = GenerateDraftPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "絵本ドラフト生成リクエストの入力値が不正です。"
    };
  }

  const project = await getProjectByKey(parsed.data.projectKey);
  if (!project) {
    return {
      ok: false,
      message: "指定されたプロジェクトが見つかりませんでした。"
    };
  }

  const pageCount = parsed.data.pageCount ?? DEFAULT_PICTURE_BOOK_PAGE_COUNT;
  const summarySentences = project.summarySentences ?? [];

  try {
    const draft = await generatePictureBookDraft({
      projectTitle: project.title,
      entries: project.entries,
      sentences: summarySentences,
      pageCount
    });

    if (draft && draft.length > 0) {
      return {
        ok: true,
        pages: draft,
        source: "llm"
      };
    }

    return {
      ok: true,
      pages: buildInitialPictureBookPages(summarySentences, project.entries, pageCount),
      source: "fallback"
    };
  } catch (error) {
    console.error("絵本ドラフト生成に失敗:", error);
    return {
      ok: true,
      pages: buildInitialPictureBookPages(summarySentences, project.entries, pageCount),
      source: "fallback"
    };
  }
}

export async function savePictureBookPagesAction(
  payload: z.infer<typeof SavePictureBookPayloadSchema>
): Promise<SavePictureBookPagesResponse> {
  const parsed = SavePictureBookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "絵本データ保存リクエストの入力値が不正です。"
    };
  }
  try {
    await saveProjectPictureBookPages({
      key: parsed.data.projectKey,
      pages: parsed.data.pages
    });
    revalidatePath(`/projects/${parsed.data.projectKey}/picture-book`);
    return { ok: true };
  } catch (error) {
    console.error("絵本データの保存に失敗しました:", error);
    return { ok: false, message: "絵本を保存できませんでした。" };
  }
}
