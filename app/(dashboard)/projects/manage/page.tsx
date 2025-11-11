import { ManageClient } from "@/components/manage/manage-client";
import { listManageableProjects } from "@/lib/projects/persistence";
import { listAuditEvents } from "@/lib/telemetry/audit";

export default async function ProjectManagePage() {
  const projects = await listManageableProjects();
  const auditEvents = listAuditEvents(10);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">プロジェクトの管理</h2>
      </header>
        <ManageClient projects={projects} auditEvents={auditEvents} />
      </section>
    </div>
  );
}
