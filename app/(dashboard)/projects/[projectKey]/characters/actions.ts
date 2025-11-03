"use server";

import { z } from "zod";
import { getProjectByKey } from "@/lib/projects/repository";
import { generateCharacterAnalysis } from "@/lib/characters/service";
import { collectCharacterEntries } from "@/lib/characters/utils";

const CharacterAnalysisSchema = z.object({
  projectKey: z.string().min(1),
  characterName: z.string().min(1)
});

export type CharacterAnalysisActionInput = z.infer<typeof CharacterAnalysisSchema>;

export type CharacterAnalysisActionSuccess = {
  ok: true;
  analysis: string;
  citations: number[];
  mode: "llm" | "sample";
};

export type CharacterAnalysisActionError = {
  ok: false;
  message: string;
};

export type CharacterAnalysisActionResponse =
  | CharacterAnalysisActionSuccess
  | CharacterAnalysisActionError;

export async function generateCharacterAnalysisAction(
  payload: CharacterAnalysisActionInput
): Promise<CharacterAnalysisActionResponse> {
  const parsed = CharacterAnalysisSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "キャラクター解析の入力値が不正です。"
    };
  }

  const { projectKey, characterName } = parsed.data;
  const project = await getProjectByKey(projectKey);
  if (!project) {
    return {
      ok: false,
      message: "プロジェクトが見つかりません。"
    };
  }

  const character = project.characters.find(
    (item) => item.Name?.trim().toLowerCase() === characterName.trim().toLowerCase()
  );
  if (!character) {
    return {
      ok: false,
      message: "選択したキャラクターが見つかりません。"
    };
  }

  const matchingEntries = collectCharacterEntries(project.entries, character.Name ?? "", 12);
  const result = await generateCharacterAnalysis({
    project,
    character,
    entries: matchingEntries
  });

  return {
    ok: true,
    analysis: result.analysis,
    citations: result.citations,
    mode: result.mode
  };
}
