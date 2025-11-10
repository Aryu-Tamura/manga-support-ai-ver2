"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

type SourcePanelEntry = {
  id: number;
  text: string;
  summary?: string;
};

type SourcePanelProps = {
  entries: SourcePanelEntry[];
  highlightedIds?: number[];
  activeId?: number | null;
};

export function SourcePanel({ entries, highlightedIds = [], activeId = null }: SourcePanelProps) {
  const highlightedSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const entryRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const containerRef = useRef<HTMLUListElement>(null);

  const setEntryRef = useCallback(
    (id: number) => (node: HTMLLIElement | null) => {
      if (!entryRefs.current) {
        entryRefs.current = new Map();
      }
      if (node) {
        entryRefs.current.set(id, node);
      } else {
        entryRefs.current.delete(id);
      }
    },
    []
  );

  useEffect(() => {
    if (typeof activeId !== "number") {
      return;
    }
    const target = entryRefs.current.get(activeId);
    const container = containerRef.current;
    if (target && container) {
      const containerTop = container.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      const offset = targetTop - containerTop + container.scrollTop - 12;
      container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    }
  }, [activeId]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-sm text-muted-foreground">
        選択したチャンクの本文がここに表示されます。範囲を指定して「要約を生成」を実行してください。
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">参照元チャンク</p>
        <p className="text-sm text-muted-foreground">
          要約に紐づく本文です。ハイライト表示されている項目が引用候補です。
        </p>
      </header>
      <ul
        ref={containerRef}
        className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[70vh]"
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            ref={setEntryRef(entry.id)}
            tabIndex={0}
            className={cn(
              "select-text rounded-md border border-border/50 bg-background/80 p-3 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              (highlightedSet.has(entry.id) || entry.id === activeId) &&
                "border-primary/60 bg-primary/5 shadow-sm",
              entry.id === activeId && "ring-2 ring-primary/40"
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chunk {entry.id}
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground select-text">
              {entry.text || "（本文なし）"}
            </p>
            {entry.summary && entry.summary.trim().length > 0 && (
              <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground select-text">
                要約: {entry.summary}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
