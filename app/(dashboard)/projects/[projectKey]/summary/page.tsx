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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] 2xl:grid-cols-[minmax(0,480px)_1fr]">
        <SummaryClient
          projectKey={project.key}
          projectTitle={project.title}
          chunkCount={project.entries.length}
          entries={entries}
          grainOptions={SUMMARY_GRAIN_OPTIONS}
          sourcePanelContainerId="summary-source-panel-root"
        />
        <div className="flex flex-col gap-6">
          <SummaryPreview project={project} />
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
            <header className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">引用チャンク</h3>
              <p className="text-sm text-muted-foreground">
                要約で使われたチャンクにジャンプして根拠をすばやく確認できます。
              </p>
            </header>
            <div
              id="summary-source-panel-root"
              className="min-h-[360px]"
            />
          </section>
        </div>
      </div>
    </section>
  );
}
