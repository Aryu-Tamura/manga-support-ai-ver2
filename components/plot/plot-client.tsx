"use client";

import { useMemo, useState, useTransition } from "react";
import {
  generatePlotAction,
  generatePlotDocxAction
} from "@/app/(dashboard)/projects/[projectKey]/plot/actions";
import { SourcePanel } from "@/components/summary/source-panel";
import { cn } from "@/lib/utils";

type PlotEntry = {
  id: number;
  text: string;
  summary?: string;
};

type PlotClientProps = {
  projectKey: string;
  projectTitle: string;
  chunkCount: number;
  entries: PlotEntry[];
};

type PlotState =
  | {
      script: string;
      citations: number[];
      mode: "llm" | "sample";
    }
  | null;

export function PlotClient({
  projectKey,
  projectTitle,
  chunkCount,
  entries
}: PlotClientProps) {
  const [startId, setStartId] = useState(1);
  const [endId, setEndId] = useState(Math.min(chunkCount, 5));
  const [plotState, setPlotState] = useState<PlotState>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isDownloading, startDownload] = useTransition();

  const clampedStart = Math.max(1, Math.min(startId, chunkCount || 1));
  const clampedEnd = Math.max(clampedStart, Math.min(endId, chunkCount || 1));

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.id >= clampedStart && entry.id <= clampedEnd),
    [entries, clampedStart, clampedEnd]
  );

  const handleGenerate = () => {
    setErrorMessage(null);
    setDownloadMessage(null);
    startGenerate(async () => {
      const response = await generatePlotAction({
        projectKey,
        start: clampedStart,
        end: clampedEnd
      });
      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }
      const draft = response.script;
      setPlotState({
        script: draft,
        citations: response.citations,
        mode: response.mode
      });
      setScriptDraft(draft);
    });
  };

  const handleDownload = () => {
    if (!scriptDraft.trim()) {
      setDownloadMessage("ダウンロードする前にシナリオ案を生成してください。");
      return;
    }
    setDownloadMessage(null);
    startDownload(async () => {
      const response = await generatePlotDocxAction({ script: scriptDraft });
      if (!response.ok) {
        setDownloadMessage(response.message);
        return;
      }
      const arrayBuffer = base64ToUint8Array(response.base64);
      const blob = new Blob([arrayBuffer], { type: response.mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectKey}_plot.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDownloadMessage("DOCX をダウンロードしました。");
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
          <header className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight">チャンク範囲</h3>
            <p className="text-sm text-muted-foreground">
              プロット化したいチャンク範囲を指定し、叩き台を生成します。生成後は右側のエディタで調整できます。
            </p>
          </header>

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              id="plot-start"
              label="開始チャンク"
              value={startId}
              min={1}
              max={chunkCount || 1}
              onChange={setStartId}
            />
            <NumberField
              id="plot-end"
              label="終了チャンク"
              value={endId}
              min={1}
              max={chunkCount || 1}
              onChange={setEndId}
            />
          </div>

          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            選択中: チャンク {clampedStart}〜{clampedEnd}（全 {selectedEntries.length} 件）
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isGenerating && "cursor-not-allowed opacity-60"
            )}
            disabled={isGenerating}
          >
            {isGenerating ? "生成中…" : "プロット叩き台を生成"}
          </button>
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight">{projectTitle} / 生成結果</h3>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {plotState?.mode === "llm"
                ? "LLMモード（OpenAI 連携）"
                : "サンプルモード（OpenAI未接続）"}
            </p>
          </header>
          <textarea
            value={scriptDraft}
            onChange={(event) => setScriptDraft(event.target.value)}
            placeholder="ここにプロット叩き台が表示されます。生成後は自由に編集して、DOCX として書き出せます。"
            className="min-h-[280px] w-full rounded-md border border-border/60 bg-background/80 p-4 text-sm leading-relaxed text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isDownloading && "cursor-not-allowed opacity-60"
              )}
              disabled={isDownloading}
            >
              {isDownloading ? "作成中…" : "DOCXとしてダウンロード"}
            </button>
            {plotState?.citations.length ? (
              <span className="text-xs text-muted-foreground">
                引用チャンク: {plotState.citations.join(", ")}
              </span>
            ) : null}
          </div>
          {downloadMessage && (
            <p
              className={cn(
                "text-sm",
                downloadMessage.includes("エラー") ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {downloadMessage}
            </p>
          )}
        </section>
      </div>

      <SourcePanel entries={selectedEntries} highlightedIds={plotState?.citations ?? []} />
    </div>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

function NumberField({ id, label, value, min, max, onChange }: NumberFieldProps) {
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
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || min)}
      />
    </label>
  );
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
