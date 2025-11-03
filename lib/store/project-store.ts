import { create } from "zustand";
import type { ProjectSummary } from "@/lib/projects/types";

type ProjectStoreState = {
  projects: ProjectSummary[];
  currentProjectKey: string | null;
  setProjects: (projects: ProjectSummary[]) => void;
  setCurrentProject: (key: string) => void;
};

export const useProjectStore = create<ProjectStoreState>((set) => ({
  projects: [],
  currentProjectKey: null,
  setProjects: (projects) =>
    set((state) => {
      const nextKey =
        state.currentProjectKey && projects.some((item) => item.key === state.currentProjectKey)
          ? state.currentProjectKey
          : projects[0]?.key ?? null;
      return {
        projects,
        currentProjectKey: nextKey
      };
    }),
  setCurrentProject: (key) =>
    set((state) => {
      const exists = state.projects.some((item) => item.key === key);
      return exists
        ? { currentProjectKey: key }
        : {
            currentProjectKey: state.currentProjectKey
          };
    })
}));
