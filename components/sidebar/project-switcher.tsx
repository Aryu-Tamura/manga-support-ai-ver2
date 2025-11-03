"use client";

import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/project-store";
import { cn } from "@/lib/utils";

export function ProjectSwitcher() {
  const router = useRouter();
  const projects = useProjectStore((state) => state.projects);
  const currentKey = useProjectStore((state) => state.currentProjectKey);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
        利用可能なプロジェクトがありません。管理画面から追加してください。
      </div>
    );
  }

  return (
    <label className="flex w-full flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        プロジェクト
      </span>
      <select
        value={currentKey ?? ""}
        onChange={(event) => {
          const key = event.target.value;
          if (!key) return;
          setCurrentProject(key);
          router.push(`/projects/${key}/summary`);
        }}
        className={cn(
          "w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium",
          "outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:ring-offset-2"
        )}
      >
        {projects.map((project) => (
          <option key={project.key} value={project.key}>
            {project.title}
          </option>
        ))}
      </select>
    </label>
  );
}
