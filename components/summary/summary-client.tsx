"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { generateSummaryAction } from "@/app/(dashboard)/projects/[projectKey]/summary/actions";
import { DEFAULT_SUMMARY_GRAIN } from "@/lib/config/summary";
import { cn } from "@/lib/utils";
import { SourcePanel } from "./source-panel";
import type { SummarySentence } from "@/lib/projects/types";

type SummaryEntry = {
  id: number;
  text: string;
  summary?: string;
};

type SummaryClientProps = {
  projectKey: string;
  projectTitle: string;
  chunkCount: number;
  entries: SummaryEntry[];
  grainOptions: number[];
  sourcePanelContainerId?: string;
};

type SummaryState =
  | {
      summaryText: string;
      sentences: SummarySentence[];
      citations: number[];
      mode: "llm" | "sample";
    }
  | null;

export function SummaryClient({
  projectKey,
  projectTitle,
  chunkCount,
  entries,
  grainOptions,
  sourcePanelContainerId
}: SummaryClientProps) {
  const [rangeMode, setRangeMode] = useState<"all" | "custom">("all");
  const [startId, setStartId] = useState(1);
  const [endId, setEndId] = useState(chunkCount || 1);
  const [grain, setGrain] = useState(
    grainOptions.includes(DEFAULT_SUMMARY_GRAIN)
      ? DEFAULT_SUMMARY_GRAIN
      : grainOptions[Math.floor(grainOptions.length / 2)] ?? DEFAULT_SUMMARY_GRAIN
  );
  const [summaryState, setSummaryState] = useState<SummaryState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const minGrain = useMemo(
    () => (grainOptions.length ? Math.min(...grainOptions) : DEFAULT_SUMMARY_GRAIN),
    [grainOptions]
  );
  const maxGrain = useMemo(
    () => (grainOptions.length ? Math.max(...grainOptions) : DEFAULT_SUMMARY_GRAIN),
    [grainOptions]
  );
  const grainStep = 50;

  const effectiveStart = rangeMode === "all" ? 1 : clamp(startId, 1, chunkCount);
  const effectiveEnd =
    rangeMode === "all" ? Math.max(1, chunkCount) : clamp(endId, effectiveStart, chunkCount);

  const selectedEntries = useMemo(() => {
    return entries.filter((entry) => entry.id >= effectiveStart && entry.id <= effectiveEnd);
  }, [entries, effectiveEnd, effectiveStart]);

  const entrySummaryMap = useMemo(() => {
    if (!summaryState?.sentences?.length) {
      return new Map<number, string>();
    }
    const collected = new Map<number, string[]>();
    for (const sentence of summaryState.sentences) {
      const text = sentence.text.trim();
      if (!text) {
        continue;
      }
      for (const citation of sentence.citations) {
        const list = collected.get(citation) ?? [];
        list.push(text);
        collected.set(citation, list);
      }
    }
    const summaryByEntry = new Map<number, string>();
    for (const [id, fragments] of collected) {
      const unique = Array.from(
        new Set(fragments.map((fragment) => fragment.trim()).filter((fragment) => fragment))
      );
      if (!unique.length) {
        continue;
      }
      summaryByEntry.set(id, unique.join(" / "));
    }
    return summaryByEntry;
  }, [summaryState?.sentences]);

  const enrichedEntries = useMemo(() => {
    return selectedEntries.map((entry) => ({
      ...entry,
      summary: entrySummaryMap.get(entry.id) ?? entry.summary
    }));
  }, [entrySummaryMap, selectedEntries]);

  const handleRangeModeChange = useCallback(
    (mode: "all" | "custom") => {
      setRangeMode(mode);
      if (mode === "all") {
        setStartId(1);
        setEndId(chunkCount || 1);
      }
    },
    [chunkCount]
  );

  const handleGenerate = useCallback(() => {
    setErrorMessage(null);
    setActiveCitation(null);
    startTransition(async () => {
      const response = await generateSummaryAction({
        projectKey,
        start: effectiveStart,
        end: effectiveEnd,
        grain
      });
      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }
      setSummaryState({
        summaryText: response.summary,
        sentences: response.sentences,
        citations: response.citations,
        mode: response.mode
      });
    });
  }, [effectiveEnd, effectiveStart, grain, projectKey]);

  useEffect(() => {
    const citations = summaryState?.citations ?? [];
    if (!citations.length) {
      setActiveCitation(null);
      return;
    }
    setActiveCitation((current) => (current && citations.includes(current) ? current : citations[0]));
  }, [summaryState?.citations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => {};
    }

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ citation: number }>).detail;
      if (!detail || typeof detail.citation !== "number") {
        return;
      }
      setActiveCitation(detail.citation);
    };
    window.addEventListener("summary:citation-select", listener as EventListener);
    return () => {
      window.removeEventListener("summary:citation-select", listener as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!summaryState) {
      return;
    }
    notifySummaryPreviewUpdate({
      summary: summaryState.summaryText,
      sentences: summaryState.sentences
    });
  }, [summaryState]);

  useEffect(() => {
    if (!sourcePanelContainerId || typeof window === "undefined") {
      setPortalTarget(null);
      return;
    }
    const element = document.getElementById(sourcePanelContainerId);
    setPortalTarget(element);
  }, [sourcePanelContainerId]);

  return (
    <div className="space-y-6">
      <section className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">要約設定</h3>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            対象: {projectTitle}
          </p>
        </header>

        <div className="space-y-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              範囲
            </legend>
            <div className="flex flex-wrap gap-3">
              <RangeToggle
                label="全体"
                active={rangeMode === "all"}
                onClick={() => handleRangeModeChange("all")}
              />
              <RangeToggle
                label="チャンク範囲"
                active={rangeMode === "custom"}
                onClick={() => handleRangeModeChange("custom")}
              />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              id="summary-start"
              label="開始チャンク"
              value={startId}
              min={1}
              max={chunkCount}
              disabled={rangeMode === "all"}
              onChange={(value) => setStartId(value)}
            />
            <NumberField
              id="summary-end"
              label="終了チャンク"
              value={endId}
              min={1}
              max={chunkCount}
              disabled={rangeMode === "all"}
              onChange={(value) => setEndId(value)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="summary-grain"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              文字数の目安
            </label>
            <div className="space-y-1">
              <input
                id="summary-grain"
                type="range"
                min={minGrain}
                max={maxGrain}
                step={grainStep}
                list="summary-grain-ticks"
                value={grain}
                onChange={(event) => setGrain(Number.parseInt(event.target.value, 10))}
                className="w-full accent-primary"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>約 {grain} 文字</span>
                <span>
                  {minGrain}–{maxGrain}
                </span>
              </div>
            </div>
            <datalist id="summary-grain-ticks">
              {grainOptions.map((option) => (
                <option key={option} value={option} label={`${option}`} />
              ))}
            </datalist>
          </div>

          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            選択中: チャンク {effectiveStart}〜{effectiveEnd}（全 {selectedEntries.length} 件）
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending || selectedEntries.length === 0}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              (isPending || selectedEntries.length === 0) && "cursor-not-allowed opacity-60"
            )}
          >
            {isPending ? "生成中…" : "要約を生成"}
          </button>
          {summaryState && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {summaryState.mode === "llm"
                ? "LLMモードで生成済みの要約が下部に反映されています。"
                : "サンプルモードで生成済みの要約が下部に反映されています。"}
            </p>
          )}
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </section>

      {sourcePanelContainerId
        ? portalTarget
          ? createPortal(
              <SourcePanel
                entries={enrichedEntries}
                highlightedIds={summaryState?.citations ?? []}
                activeId={activeCitation}
              />,
              portalTarget
            )
          : null
        : (
              <SourcePanel
                entries={enrichedEntries}
                highlightedIds={summaryState?.citations ?? []}
                activeId={activeCitation}
              />
            )}
    </div>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function NumberField({ id, label, value, min, max, disabled, onChange }: NumberFieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        id={id}
        type="number"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || min)}
      />
    </label>
  );
}

type RangeToggleProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function RangeToggle({ label, active, onClick }: RangeToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1 text-sm font-medium transition",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-border/70 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type SummaryPreviewUpdateDetail = {
  summary: string;
  sentences: SummarySentence[];
};

function notifySummaryPreviewUpdate(detail: SummaryPreviewUpdateDetail) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<SummaryPreviewUpdateDetail>("summary:preview-update", {
      detail
    })
  );
}
