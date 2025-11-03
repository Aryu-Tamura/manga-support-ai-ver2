import { redirect } from "next/navigation";
import { listProjectSummaries } from "@/lib/projects/repository";

export default async function ProjectsIndexPage() {
  const projects = await listProjectSummaries();
  if (projects.length > 0) {
    redirect(`/projects/${projects[0].key}/summary`);
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-muted-foreground">
      <h2 className="text-xl font-semibold text-foreground">プロジェクトがまだ登録されていません</h2>
      <p>
        サンプルを読み込むか、管理ページから原作ファイルを追加すると各メニューが利用できます。
      </p>
    </section>
  );
}
