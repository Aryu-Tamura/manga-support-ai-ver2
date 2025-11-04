import { notFound } from "next/navigation";
import { ValidationClient } from "@/components/validation/validation-client";
import { getProjectByKey } from "@/lib/projects/repository";

type ValidationPageProps = {
  params: {
    projectKey: string;
  };
};

export default async function ProjectValidationPage({ params }: ValidationPageProps) {
  const project = await getProjectByKey(params.projectKey);
  if (!project) {
    notFound();
  }

  const sentences = project.summarySentences ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{project.title} / 要約検証</h2>
        <p className="text-muted-foreground">
          要約ブロックの順序を整え、LLMにより表現候補や再構成要約を生成します。
        </p>
      </header>
      <ValidationClient projectKey={project.key} entries={project.entries} sentences={sentences} />
    </section>
  );
}
