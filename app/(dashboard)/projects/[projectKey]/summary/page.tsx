import { notFound } from "next/navigation";
import { SummaryClient } from "@/components/summary/summary-client";
import { SUMMARY_GRAIN_OPTIONS } from "@/lib/config/summary";
import { getProjectByKey } from "@/lib/projects/repository";

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
          原作チャンクの範囲と文字数を指定して要約を生成します。Streamlit 版の操作感を踏襲しつつ、
          shadcn/ui + Tailwind に最適化した UI を提供します。
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">チャンク数</p>
          <p className="mt-1 text-2xl font-semibold">{project.entries.length}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">要約（抜粋）</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {project.summary || "要約がまだ登録されていません。"}
          </p>
        </div>
      </div>
      <SummaryClient
        projectKey={project.key}
        projectTitle={project.title}
        chunkCount={project.entries.length}
        entries={entries}
        grainOptions={SUMMARY_GRAIN_OPTIONS}
      />
    </section>
  );
}
