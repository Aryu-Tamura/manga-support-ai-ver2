"use client";

import { useLayoutEffect } from "react";
import type { ProjectSummary } from "@/lib/projects/types";
import { useProjectStore } from "@/lib/store/project-store";

type ProjectStoreProviderProps = {
  projects: ProjectSummary[];
  children: React.ReactNode;
};

export function ProjectStoreProvider({ projects, children }: ProjectStoreProviderProps) {
  const setProjects = useProjectStore((state) => state.setProjects);

  useLayoutEffect(() => {
    setProjects(projects);
  }, [projects, setProjects]);

  return <>{children}</>;
}
