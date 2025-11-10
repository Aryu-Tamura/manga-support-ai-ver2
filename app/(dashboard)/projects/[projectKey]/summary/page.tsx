import { notFound } from "next/navigation";
import { SUMMARY_GRAIN_OPTIONS } from "@/lib/config/summary";
import { getProjectByKey } from "@/lib/projects/repository";
import { SummaryTabs } from "@/components/summary/summary-tabs";
import { buildBasicInfo } from "@/lib/summary/basic-info";

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

  return (
    <section className="space-y-8">
      <SummaryTabs
        project={project}
        projectKey={project.key}
        entries={entries}
        sentences={project.summarySentences ?? []}
        grainOptions={SUMMARY_GRAIN_OPTIONS}
        basicInfo={basicInfo}
      />
    </section>
  );
}
