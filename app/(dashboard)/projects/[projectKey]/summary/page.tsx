import { notFound } from "next/navigation";
import { SUMMARY_GRAIN_OPTIONS } from "@/lib/config/summary";
import { getProjectByKey } from "@/lib/projects/repository";
import { SummaryTabs } from "@/components/summary/summary-tabs";
import { buildBasicInfo } from "@/lib/summary/basic-info";
import {
  collectCharacterEntries,
  buildContextSnippets,
  type CharacterContext
} from "@/lib/characters/utils";

type SummaryPageProps = {
  params: {
    projectKey: string;
  };
};

export default async function ProjectSummaryPage({ params }: SummaryPageProps) {
  const project = await getProjectByKey(params.projectKey);
  if (!project) {
    notFound();
  }

  const entries = project.entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    summary: entry.summary
  }));

  const basicInfo = buildBasicInfo(project);
  const characterItems = project.characters
    .filter((character) => character.Name && character.Name.trim().length > 0)
    .map((character) => ({
      name: character.Name.trim(),
      role: character.Role ?? "",
      details: character.Details ?? ""
    }));
  const contextMap = characterItems.reduce<Record<string, CharacterContext[]>>((acc, character) => {
    const characterEntries = collectCharacterEntries(project.entries, character.name, 12);
    acc[character.name] = buildContextSnippets(characterEntries);
    return acc;
  }, {});

  return (
    <section className="space-y-8">
      <SummaryTabs
        project={project}
        projectKey={project.key}
        entries={entries}
        grainOptions={SUMMARY_GRAIN_OPTIONS}
        basicInfo={basicInfo}
        characters={characterItems}
        contexts={contextMap}
      />
    </section>
  );
}
