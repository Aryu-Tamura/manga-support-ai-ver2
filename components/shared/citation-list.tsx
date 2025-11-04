"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type CitationListProps = {
  citations: number[];
  activeId?: number | null;
  onSelect?: (id: number) => void;
  label?: string;
  className?: string;
};

export function CitationList({
  citations,
  activeId = null,
  onSelect,
  label = "引用チャンク",
  className
}: CitationListProps) {
  const items = useMemo(() => {
    const unique = new Set<number>();
    for (const raw of citations) {
      if (typeof raw !== "number" || Number.isNaN(raw)) {
        continue;
      }
      unique.add(raw);
    }
    return Array.from(unique).sort((a, b) => a - b);
  }, [citations]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}:</span>
      <div className="flex flex-wrap gap-2">
        {items.map((id) => {
          const isActive = id === activeId;
          return onSelect ? (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "inline-flex items-center justify-center rounded-full border border-border/50 px-3 py-1 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-foreground hover:bg-muted"
              )}
              aria-pressed={isActive}
            >
              Chunk {id}
            </button>
          ) : (
            <span
              key={id}
              className={cn(
                "inline-flex items-center rounded-full border border-border/50 px-3 py-1 font-medium",
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              Chunk {id}
            </span>
          );
        })}
      </div>
    </div>
  );
}