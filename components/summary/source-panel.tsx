import { useMemo } from "react";
import { cn } from "@/lib/utils";

type SourcePanelEntry = {
  id: number;
  text: string;
  summary?: string;
};

type SourcePanelProps = {
  entries: SourcePanelEntry[];
  highlightedIds?: number[];
};

export function SourcePanel({ entries, highlightedIds = [] }: SourcePanelProps) {
  const highlightedSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);

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
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "rounded-md border border-border/50 bg-background/80 p-3 text-sm transition",
              highlightedSet.has(entry.id) && "border-primary/60 bg-primary/5 shadow-sm"
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chunk {entry.id}
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
              {entry.text || "（本文なし）"}
            </p>
            {entry.summary && entry.summary.trim().length > 0 && (
              <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                要約: {entry.summary}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
