import { notFound } from "next/navigation";
import { PlotClient } from "@/components/plot/plot-client";
import { getProjectByKey } from "@/lib/projects/repository";

type PlotPageProps = {
  params: {
    projectKey: string;
  };
};

export default async function ProjectPlotPage({ params }: PlotPageProps) {
  const project = await getProjectByKey(params.projectKey);
  if (!project) {
    notFound();
  }

  const plotEntries = project.entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    summary: entry.summary
  }));

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{project.title} / プロット支援</h2>
        <p className="text-muted-foreground">
          指定したチャンク範囲をもとに会話主体の叩き台を生成し、DOCX として書き出せます。
        </p>
      </header>
      <PlotClient
        projectKey={project.key}
        projectTitle={project.title}
        chunkCount={project.entries.length}
        entries={plotEntries}
      />
    </section>
  );
}
