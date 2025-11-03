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
          <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </ProjectStoreProvider>
  );
}
