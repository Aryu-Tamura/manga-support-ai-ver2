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
  const savedPages = project.pictureBook?.pages ?? null;
  const initialPages =
    savedPages && savedPages.length > 0
      ? savedPages
      : buildInitialPictureBookPages(summarySentences, project.entries, DEFAULT_PICTURE_BOOK_PAGE_COUNT);
  const initialSource = savedPages && savedPages.length > 0 ? "saved" : "fallback";

  return (
    <section className="w-full bg-muted/5">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10">
        <PictureBookClient
          projectKey={project.key}
          projectTitle={project.title}
          entries={project.entries}
          sentences={summarySentences}
          initialPages={initialPages}
          initialSource={initialSource}
        />
      </div>
    </section>
  );
}
