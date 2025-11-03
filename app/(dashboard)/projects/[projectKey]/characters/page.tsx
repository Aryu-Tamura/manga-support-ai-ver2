import { notFound } from "next/navigation";
import { CharacterClient } from "@/components/characters/character-client";
import {
  collectCharacterEntries,
  buildContextSnippets,
  type CharacterContext
} from "@/lib/characters/utils";
import { getProjectByKey } from "@/lib/projects/repository";

type CharactersPageProps = {
  params: {
    projectKey: string;
  };
};

export default async function ProjectCharactersPage({ params }: CharactersPageProps) {
  const project = await getProjectByKey(params.projectKey);
  if (!project) {
    notFound();
  }

  const characterItems = project.characters
    .filter((character) => character.Name && character.Name.trim().length > 0)
    .map((character) => ({
      name: character.Name.trim(),
      role: character.Role ?? "",
      details: character.Details ?? ""
    }));

  const contextMap = characterItems.reduce<Record<string, CharacterContext[]>>((acc, character) => {
    const entries = collectCharacterEntries(project.entries, character.name, 12);
    acc[character.name] = buildContextSnippets(entries);
    return acc;
  }, {});

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{project.title} / キャラ解析</h2>
        <p className="text-muted-foreground">
          登場人物ごとの本文抜粋を確認しながら、編集者向けの解析メモを生成します。
        </p>
      </header>
      <CharacterClient
        projectKey={project.key}
        projectTitle={project.title}
        characters={characterItems}
        contexts={contextMap}
      />
    </section>
  );
}
