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
    <section className="w-full bg-muted/10">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10">
        <ValidationClient projectKey={project.key} entries={project.entries} sentences={sentences} />
      </div>
    </section>
  );
}
