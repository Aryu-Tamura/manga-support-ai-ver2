import { ProjectSwitcher } from "@/components/sidebar/project-switcher";
import { SidebarNav } from "@/components/sidebar/nav-links";

type SidebarProps = {
  className?: string;
};

export function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={["flex h-full w-72 flex-col gap-6 border-r border-border bg-card px-6 py-8", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Manga Support AI
        </p>
        <h1 className="mt-1 text-lg font-bold text-foreground">コミカライズ支援</h1>
      </div>
      <ProjectSwitcher />
      <SidebarNav />
    </aside>
  );
}
