"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  generateSummaryVariationsAction,
  generateReconstructedSummaryAction
} from "@/app/(dashboard)/projects/[projectKey]/validation/actions";
import { SourcePanel } from "@/components/summary/source-panel";
import {
  DEFAULT_VALIDATION_TARGET_LENGTH,
  VALIDATION_TARGET_LENGTHS
} from "@/lib/config/validation";
import {
  buildInitialBlocks,
  defaultRange,
  type ValidationBlock
} from "@/lib/validation/utils";
import { cn } from "@/lib/utils";

type ValidationEntry = {
  id: number;
  summary: string;
  text: string;
};

type ValidationClientProps = {
  projectKey: string;
  entries: ValidationEntry[];
};

type VariationsState =
  | {
      variations: { variant: string; note: string }[];
      mode: "llm" | "sample";
    }
  | null;

type ReconstructionState =
  | {
      summary: string;
      mode: "llm" | "sample";
    }
  | null;

export function ValidationClient({ projectKey, entries }: ValidationClientProps) {
  const initialRange = useMemo(() => defaultRange(entries), [entries]);
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const initialBlocks = useMemo(
    () => buildInitialBlocks(entries, initialRange.start, initialRange.end),
    [entries, initialRange.start, initialRange.end]
  );
  const HISTORY_LIMIT = 50;
  const [history, setHistory] = useState(() => ({
    past: [] as ValidationBlock[][],
    present: initialBlocks,
    future: [] as ValidationBlock[][]
  }));
  const [selectedId, setSelectedId] = useState<number | null>(initialBlocks[0]?.entryId ?? null);
  const [variationsState, setVariationsState] = useState<VariationsState>(null);
  const [reconstructionState, setReconstructionState] = useState<ReconstructionState>(null);
  const [variationPrompt, setVariationPrompt] = useState("読みやすくする");
  const [targetLength, setTargetLength] = useState(DEFAULT_VALIDATION_TARGET_LENGTH);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const [variationMessage, setVariationMessage] = useState<string | null>(null);
  const [reconstructionMessage, setReconstructionMessage] = useState<string | null>(null);
  const [isApplyingRange, startApplyRange] = useTransition();
  const [isGeneratingVariations, startGenerateVariations] = useTransition();
  const [isReconstructing, startReconstruct] = useTransition();

  const blocks = history.present;

  useEffect(() => {
    if (selectedId === null && blocks.length) {
      setSelectedId(blocks[0].entryId);
    }
  }, [blocks, selectedId]);

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.entryId === selectedId) ?? null,
    [blocks, selectedId]
  );

  const selectedContext = useMemo(() => {
    if (!selectedBlock) {
      return [];
    }
    return [
      {
        id: selectedBlock.entryId,
        text: selectedBlock.text,
        summary: selectedBlock.summary
      }
    ];
  }, [selectedBlock]);

  const pushHistory = (nextBlocks: ValidationBlock[]) => {
    setHistory((prev) => ({
      past: [...prev.past, prev.present].slice(-HISTORY_LIMIT),
      present: nextBlocks,
      future: []
    }));
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (!prev.past.length) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future].slice(0, HISTORY_LIMIT)
      };
    });
  };

  const handleRedo = () => {
    setHistory((prev) => {
      if (!prev.future.length) return prev;
      const [next, ...rest] = prev.future;
      return {
        past: [...prev.past, prev.present].slice(-HISTORY_LIMIT),
        present: next,
        future: rest
      };
    });
  };

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleApplyRange = () => {
    setRangeMessage(null);
    startApplyRange(() => {
      const start = Math.max(1, Math.min(rangeStart, entries[entries.length - 1]?.id ?? 1));
      const end = Math.max(start, Math.min(rangeEnd, entries[entries.length - 1]?.id ?? start));
      const nextBlocks = buildInitialBlocks(entries, start, end);
      if (nextBlocks.length === 0) {
        setRangeMessage("指定範囲に要約ブロックがありません。");
        return;
      }
      pushHistory(nextBlocks);
      setSelectedId(nextBlocks[0].entryId);
      setVariationsState(null);
      setReconstructionState(null);
      setRangeMessage(`チャンク ${start}〜${end} をロードしました。`);
    });
  };

  const handleSummaryChange = (entryId: number, summary: string) => {
    const nextBlocks = blocks.map((block) =>
      block.entryId === entryId
        ? {
            ...block,
            summary
          }
        : block
    );
    pushHistory(nextBlocks);
  };

  const handleMoveBlock = (entryId: number, direction: "up" | "down") => {
    const index = blocks.findIndex((block) => block.entryId === entryId);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [current] = next.splice(index, 1);
    next.splice(target, 0, current);
    pushHistory(
      next.map((block, idx) => ({
        ...block,
        order: idx + 1
      }))
    );
  };

  const handleGenerateVariations = () => {
    if (!selectedBlock) {
      setVariationMessage("要約ブロックが選択されていません。");
      return;
    }
    const summaryText = selectedBlock.summary.trim();
    if (!summaryText) {
      setVariationMessage("要約が空です。先に要約文を入力してください。");
      return;
    }
    setVariationMessage(null);
    startGenerateVariations(async () => {
      const response = await generateSummaryVariationsAction({
        summary: summaryText,
        customPrompt: variationPrompt
      });
      if (!response.ok) {
        setVariationMessage(response.message);
        return;
      }
      setVariationsState({
        variations: response.variations,
        mode: response.mode
      });
      setVariationMessage(
        response.mode === "llm"
          ? "LLMによる候補を生成しました。"
          : "サンプル候補を表示しています。"
      );
    });
  };

  const handleApplyVariation = (variant: string) => {
    if (!selectedBlock) return;
    handleSummaryChange(selectedBlock.entryId, variant);
    setVariationsState(null);
    setVariationMessage("要約ブロックを更新しました。");
  };

  const handleReconstructSummary = () => {
    const payloadBlocks = blocks.map((block) => ({
      id: block.entryId,
      summary: block.summary.trim()
    }));
    if (!payloadBlocks.every((block) => block.summary.length > 0)) {
      setReconstructionMessage("空の要約が含まれています。全ての要約を確認してください。");
      return;
    }
    setReconstructionMessage(null);
    startReconstruct(async () => {
      const response = await generateReconstructedSummaryAction({
        projectKey,
        blocks: payloadBlocks,
        targetLength
      });
      if (!response.ok) {
        setReconstructionMessage(response.message);
        return;
      }
      setReconstructionState({
        summary: response.summary,
        mode: response.mode
      });
      setReconstructionMessage(
        response.mode === "llm"
          ? "LLM要約を生成しました。"
          : "サンプル再構成を表示しています。"
      );
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">要約ブロックの編集</h3>
          <p className="text-sm text-muted-foreground">
            チャンク範囲を指定し、各要約ブロックの順序と表現を調整します。
          </p>
        </header>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-sm",
              canUndo ? "hover:bg-muted" : "cursor-not-allowed opacity-60"
            )}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-sm",
              canRedo ? "hover:bg-muted" : "cursor-not-allowed opacity-60"
            )}
          >
            Redo
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              id="validation-start"
              label="開始チャンク"
              value={rangeStart}
              onChange={setRangeStart}
              min={1}
              max={entries[entries.length - 1]?.id ?? 1}
            />
            <NumberField
              id="validation-end"
              label="終了チャンク"
              value={rangeEnd}
              onChange={setRangeEnd}
              min={1}
              max={entries[entries.length - 1]?.id ?? 1}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold transition",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isApplyingRange && "cursor-not-allowed opacity-60"
              )}
              onClick={handleApplyRange}
              disabled={isApplyingRange}
            >
              {isApplyingRange ? "適用中…" : "範囲を適用"}
            </button>
          </div>
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            現在のブロック数: {blocks.length}（合計 {entries.length} チャンク）
          </div>
        </div>
        {rangeMessage && <p className="text-sm text-muted-foreground">{rangeMessage}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,0.4fr)]">
          <div className="space-y-3">
            {blocks.map((block, index) => (
              <article
                key={block.entryId}
                className={cn(
                  "space-y-2 rounded-md border border-border px-4 py-3 transition",
                  selectedId === block.entryId && "border-primary bg-primary/5 shadow-sm"
                )}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-foreground"
                    onClick={() => setSelectedId(block.entryId)}
                  >
                    ブロック {index + 1}（ID {block.entryId}）
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
                      onClick={() => handleMoveBlock(block.entryId, "up")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
                      onClick={() => handleMoveBlock(block.entryId, "down")}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <textarea
                  value={block.summary}
                  onChange={(event) => handleSummaryChange(block.entryId, event.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </article>
            ))}
            {blocks.length === 0 && (
              <div className="rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
                範囲を適用すると要約ブロックが表示されます。
              </div>
            )}
          </div>
          <div className="space-y-4 rounded-md border border-border bg-background px-4 py-3">
            <header className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">バリエーション生成</h4>
              <p className="text-xs text-muted-foreground">
                選択中のブロックの表現違いを提案します。採用したい案をクリックすると置き換えられ
                ます。
              </p>
            </header>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                目的
              </span>
              <textarea
                value={variationPrompt}
                onChange={(event) => setVariationPrompt(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>
            <button
              type="button"
              onClick={handleGenerateVariations}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isGeneratingVariations && "cursor-not-allowed opacity-60"
              )}
              disabled={isGeneratingVariations}
            >
              {isGeneratingVariations ? "生成中…" : "LLM案を生成"}
            </button>
            {variationMessage && (
              <p className="text-xs text-muted-foreground">{variationMessage}</p>
            )}
            <div className="space-y-2">
              {variationsState?.variations.map((variation, index) => (
                <button
                  key={`${variation.variant}-${index}`}
                  type="button"
                  onClick={() => handleApplyVariation(variation.variant)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm leading-relaxed text-foreground transition hover:border-primary hover:bg-primary/5"
                >
                  <p className="font-medium">{variation.note || `案 ${index + 1}`}</p>
                  <p className="mt-1 text-muted-foreground">{variation.variant}</p>
                </button>
              ))}
              {!variationsState && (
                <p className="text-xs text-muted-foreground">
                  生成した候補がここに表示されます。クリックすると要約が置き換わります。
                </p>
              )}
            </div>
            {variationsState?.mode === "sample" && (
              <p className="text-xs text-muted-foreground">
                OpenAI API キーが未接続のため、サンプル案を表示しています。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">再構成要約</h3>
          <p className="text-sm text-muted-foreground">
            並べ替えた要約ブロックを元に新しい要約案を生成します。
          </p>
        </header>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label className="flex flex-col gap-1 md:max-w-xs">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              文字数の目安
            </span>
            <select
              value={targetLength}
              onChange={(event) => setTargetLength(Number.parseInt(event.target.value, 10))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {VALIDATION_TARGET_LENGTHS.map((length) => (
                <option key={length} value={length}>
                  約 {length} 文字
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleReconstructSummary}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isReconstructing && "cursor-not-allowed opacity-60"
            )}
            disabled={isReconstructing}
          >
            {isReconstructing ? "生成中…" : "この順序で要約を生成"}
          </button>
        </div>
        {reconstructionMessage && (
          <p className="text-sm text-muted-foreground">{reconstructionMessage}</p>
        )}
        <div className="rounded-md border border-border/60 bg-background/80 p-4 text-sm leading-relaxed text-foreground min-h-[180px] whitespace-pre-wrap">
          {reconstructionState ? (
            reconstructionState.summary
          ) : (
            <span className="text-muted-foreground">
              生成した再構成要約がここに表示されます。
            </span>
          )}
        </div>
        {reconstructionState?.mode === "sample" && (
          <p className="text-xs text-muted-foreground">
            OpenAI API キーが未接続のため、サンプル案を表示しています。
          </p>
        )}
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">選択中ブロックの本文</h3>
          <p className="text-xs text-muted-foreground">
            原文の抜粋を参照しながら要約の表現を調整できます。
          </p>
        </header>
        <SourcePanel entries={selectedContext} highlightedIds={[selectedBlock?.entryId ?? -1]} />
      </section>
    </div>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
};

function NumberField({ id, label, value, onChange, min, max }: NumberFieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || min)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </label>
  );
}
