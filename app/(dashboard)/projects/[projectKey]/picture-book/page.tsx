import { notFound } from "next/navigation";
import { PictureBookClient } from "@/components/picture-book/picture-book-client";
import { DEFAULT_PICTURE_BOOK_PAGE_COUNT, buildInitialPictureBookPages } from "@/lib/picture-book/utils";
import { getProjectByKey } from "@/lib/projects/repository";

type PictureBookPageProps = {
  params: {
    projectKey: string;
  };
};

export default async function ProjectPictureBookPage({ params }: PictureBookPageProps) {
  const project = await getProjectByKey(params.projectKey);
  if (!project) {
    notFound();
  }

  const summarySentences = project.summarySentences ?? [];
  const initialPages = buildInitialPictureBookPages(summarySentences, project.entries, DEFAULT_PICTURE_BOOK_PAGE_COUNT);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{project.title} / 絵本化</h2>
        <p className="text-muted-foreground">
          起承転結の流れを意識したページ割りを作成し、ナレーションやセリフ、画像案を編集できます。
        </p>
      </header>
      <PictureBookClient
        projectKey={project.key}
        projectTitle={project.title}
        entries={project.entries}
        sentences={summarySentences}
        initialPages={initialPages}
        initialSource="fallback"
      />
    </section>
  );
}
