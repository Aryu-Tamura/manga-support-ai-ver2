import { notFound } from "next/navigation";
import { SummaryClient } from "@/components/summary/summary-client";
import { SUMMARY_GRAIN_OPTIONS } from "@/lib/config/summary";
import { getProjectByKey } from "@/lib/projects/repository";
import { SummaryPreview } from "@/components/summary/summary-preview";

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

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{project.title}</h2>
        <p className="text-muted-foreground">
          原作チャンクの範囲と文字数を指定して要約を生成します。
        </p>
      </header>
      <SummaryClient
        projectKey={project.key}
        projectTitle={project.title}
        chunkCount={project.entries.length}
        entries={entries}
        grainOptions={SUMMARY_GRAIN_OPTIONS}
        sourcePanelContainerId="summary-source-panel-root"
      />
      <SummaryPreview project={project} />
      <div id="summary-source-panel-root" />
    </section>
  );
}