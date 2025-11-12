import { z } from "zod";

export const PICTURE_BOOK_PHASES = ["起", "承", "転", "結"] as const;

export const PictureBookPhaseSchema = z.enum(PICTURE_BOOK_PHASES);
export type PictureBookPhase = z.infer<typeof PictureBookPhaseSchema>;

export const PictureBookPageSchema = z.object({
  id: z.string().min(1),
  pageNumber: z.number().int().min(1),
  phase: PictureBookPhaseSchema,
  imagePrompt: z.string().min(1),
  imageUrl: z.string().min(1).nullable(),
  narration: z.string(),
  dialogues: z.array(z.string()),
  citations: z.array(z.number().int())
});

export type PictureBookPage = z.infer<typeof PictureBookPageSchema>;

export const PictureBookStateSchema = z.object({
  pages: z.array(PictureBookPageSchema)
});

export type PictureBookState = z.infer<typeof PictureBookStateSchema>;
