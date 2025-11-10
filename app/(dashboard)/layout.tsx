import { ProjectStoreProvider } from "@/components/providers/project-store-provider";
import { Sidebar } from "@/components/sidebar/sidebar";
import { listProjectSummaries } from "@/lib/projects/repository";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const projects = await listProjectSummaries();

  return (
    <ProjectStoreProvider projects={projects}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-muted/20">
          <div className="mx-auto flex h-full w-full flex-col gap-10 px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </ProjectStoreProvider>
  );
}
