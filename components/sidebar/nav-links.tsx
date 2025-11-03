"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardCheck,
  ListTree,
  Settings2,
  Users
} from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  baseHref: (projectKey: string | null) => string;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "summary",
    label: "原作理解",
    icon: BookOpen,
    baseHref: (key) => (key ? `/projects/${key}/summary` : "/projects")
  },
  {
    id: "characters",
    label: "キャラ解析",
    icon: Users,
    baseHref: (key) => (key ? `/projects/${key}/characters` : "/projects")
  },
  {
    id: "plot",
    label: "プロット支援",
    icon: ListTree,
    baseHref: (key) => (key ? `/projects/${key}/plot` : "/projects")
  },
  {
    id: "validation",
    label: "検証",
    icon: ClipboardCheck,
    baseHref: (key) => (key ? `/projects/${key}/validation` : "/projects")
  }
];

const MANAGE_LINK: NavItem = {
  id: "manage",
  label: "プロジェクト管理",
  icon: Settings2,
  baseHref: () => "/projects/manage"
};

export function SidebarNav() {
  const pathname = usePathname();
  const currentProjectKey = useProjectStore((state) => state.currentProjectKey);
  const hasProject = Boolean(currentProjectKey);

  return (
    <nav className="flex flex-1 flex-col gap-6 text-sm">
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const href = item.baseHref(currentProjectKey);
          const active = pathname.startsWith(href);
          const Icon = item.icon;
          return (
            <SidebarLink
              key={item.id}
              href={href}
              icon={<Icon className="h-4 w-4" aria-hidden />}
              label={item.label}
              active={active}
              disabled={!hasProject}
            />
          );
        })}
      </div>
      <div className="mt-auto pt-4">
        <SidebarLink
          href={MANAGE_LINK.baseHref(currentProjectKey)}
          icon={<MANAGE_LINK.icon className="h-4 w-4" aria-hidden />}
          label={MANAGE_LINK.label}
          active={pathname === "/projects/manage"}
        />
      </div>
    </nav>
  );
}

type SidebarLinkProps = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
};

function SidebarLink({ href, label, icon, active = false, disabled = false }: SidebarLinkProps) {
  const content = (
    <span
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {icon}
      <span>{label}</span>
    </span>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className="select-none">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
