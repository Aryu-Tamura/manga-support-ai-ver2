"use server";

import { z } from "zod";
import { generatePictureBookImage } from "@/lib/picture-book/image-service";

const GenerateImagePayloadSchema = z.object({
  projectKey: z.string().min(1),
  pageNumber: z.number().int().min(1),
  prompt: z.string().min(1, "画像プロンプトを入力してください。"),
  phase: z.string().min(1)
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
