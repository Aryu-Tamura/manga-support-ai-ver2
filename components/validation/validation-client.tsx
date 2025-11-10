"use client";

import { useMemo, useState, useTransition } from "react";
import type { DragEvent } from "react";
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
import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import { cn } from "@/lib/utils";
import { BookOpen, Edit3 } from "lucide-react";

type ValidationClientProps = {
  projectKey: string;
  entries: EntryRecord[];
  sentences: SummarySentence[];
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

export function ValidationClient({ projectKey, entries, sentences }: ValidationClientProps) {
  const entryMap = useMemo(() => {
    const map = new Map<number, EntryRecord>();
    entries.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, [entries]);

  const initialRange = useMemo(() => defaultRange(entries), [entries]);
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const [blocks, setBlocks] = useState<ValidationBlock[]>(() =>
    buildInitialBlocks(sentences, entries, initialRange.start, initialRange.end)
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(blocks[0]?.blockId ?? null);
  const [variationsState, setVariationsState] = useState<VariationsState>(null);
  const [reconstructionState, setReconstructionState] = useState<ReconstructionState>(null);
  const [variationPrompt, setVariationPrompt] = useState("読みやすくする");
  const [targetLength, setTargetLength] = useState(DEFAULT_VALIDATION_TARGET_LENGTH);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const [variationMessage, setVariationMessage] = useState<string | null>(null);
  const [reconstructionMessage, setReconstructionMessage] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<"edit" | "source">("edit");
  const [isApplyingRange, startApplyRange] = useTransition();
  const [isGeneratingVariations, startGenerateVariations] = useTransition();
  const [isReconstructing, startReconstruct] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | "start" | "end" | null>(null);

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.blockId === selectedBlockId) ?? null,
    [blocks, selectedBlockId]
  );

  const selectedContext = useMemo(() => {
    if (!selectedBlock) {
      return [];
    }
    const contexts = selectedBlock.citations
      .map((citation) => entryMap.get(citation))
      .filter((entry): entry is EntryRecord => Boolean(entry))
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        summary: entry.summary ?? ""
      }));
    if (contexts.length > 0) {
      return contexts;
    }
    if (selectedBlock.entryId > 0) {
      const entry = entryMap.get(selectedBlock.entryId);
      if (entry) {
        return [
          {
            id: entry.id,
            text: entry.text,
            summary: entry.summary ?? ""
          }
        ];
      }
    }
    return [];
  }, [entryMap, selectedBlock]);

  const handleApplyRange = () => {
    setRangeMessage(null);
    startApplyRange(() => {
      const lastEntryId = entries[entries.length - 1]?.id ?? 1;
      const start = Math.max(1, Math.min(rangeStart, lastEntryId));
      const end = Math.max(start, Math.min(rangeEnd, lastEntryId));
      const nextBlocks = buildInitialBlocks(sentences, entries, start, end);
      if (nextBlocks.length === 0) {
        setRangeMessage("指定範囲に要約ブロックがありません。");
        return;
      }
      setBlocks(nextBlocks);
      setSelectedBlockId(nextBlocks[0]?.blockId ?? null);
      setVariationsState(null);
      setReconstructionState(null);
      setRangeMessage(`チャンク ${start}〜${end} をロードしました。`);
    });
  };

  const handleSummaryChange = (blockId: string, summary: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.blockId === blockId
          ? {
              ...block,
              summary
            }
          : block
      )
    );
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, blockId: string) => {
    event.dataTransfer.setData("text/plain", blockId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(blockId);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      return;
    }
    setDragOverId(targetId);
  };

  const handleDragLeave = (targetId: string) => {
    if (dragOverId === targetId) {
      setDragOverId(null);
    }
  };

  const handleDropZoneEnter = (zone: "start" | "end") => {
    if (!draggingId) {
      return;
    }
    setDragOverId(zone);
  };

  const handleDropZoneLeave = (zone: "start" | "end") => {
    if (dragOverId === zone) {
      setDragOverId(null);
    }
  };

  const reorderBlocks = (movedId: string, updater: (list: ValidationBlock[], index: number) => ValidationBlock[]) => {
    setBlocks((prev) => {
      const currentIndex = prev.findIndex((block) => block.blockId === movedId);
      if (currentIndex === -1) {
        return prev;
      }
      const next = updater([...prev], currentIndex);
      return next.map((block, idx) => ({
        ...block,
        order: idx + 1
      }));
    });
  };

  const handleDropOnBlock = (targetBlockId: string) => {
    if (!draggingId || draggingId === targetBlockId) {
      return;
    }
    reorderBlocks(draggingId, (list, currentIndex) => {
      const [moved] = list.splice(currentIndex, 1);
      const targetIndex = list.findIndex((block) => block.blockId === targetBlockId);
      if (targetIndex === -1) {
        list.splice(currentIndex, 0, moved);
        return list;
      }
      list.splice(targetIndex, 0, moved);
      return list;
    });
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDropAtStart = () => {
    if (!draggingId) {
      return;
    }
    reorderBlocks(draggingId, (list, currentIndex) => {
      const [moved] = list.splice(currentIndex, 1);
      list.unshift(moved);
      return list;
    });
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDropAtEnd = () => {
    if (!draggingId) {
      return;
    }
    reorderBlocks(draggingId, (list, currentIndex) => {
      const [moved] = list.splice(currentIndex, 1);
      list.push(moved);
      return list;
    });
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
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
        customPrompt: variationPrompt,
        citations: selectedBlock.citations
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
    handleSummaryChange(selectedBlock.blockId, variant);
    setVariationsState(null);
    setVariationMessage("要約ブロックを更新しました。");
  };

  const handleReconstructSummary = () => {
    const payloadBlocks = blocks.map((block) => ({
      id: block.entryId,
      summary: block.summary.trim(),
      citations: block.citations
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

  const isEditView = detailView === "edit";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.3fr)_minmax(0,0.7fr)] 2xl:grid-cols-[minmax(340px,0.28fr)_minmax(0,0.72fr)]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <header className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight">作業範囲の設定</h3>
            <p className="text-sm text-muted-foreground">
              プレビューしたいチャンクの範囲を指定してから、要約ブロックの整理を行います。
            </p>
          </header>
          <div className="grid gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            <NumberField
              id="validation-range-start"
              label="開始チャンク"
              value={rangeStart}
              min={1}
              max={entries[entries.length - 1]?.id ?? 1}
              onChange={setRangeStart}
            />
            <NumberField
              id="validation-range-end"
              label="終了チャンク"
              value={rangeEnd}
              min={rangeStart}
              max={entries[entries.length - 1]?.id ?? rangeStart}
              onChange={setRangeEnd}
            />
          </div>
          <button
            type="button"
            onClick={handleApplyRange}
            disabled={isApplyingRange}
            className={cn(
              "w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isApplyingRange && "cursor-not-allowed opacity-60"
            )}
          >
            {isApplyingRange ? "読込中…" : "範囲を適用"}
          </button>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>読み込み済みブロック: {blocks.length}</span>
          <span>総チャンク数: {entries.length}</span>
        </div>
        {rangeMessage && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {rangeMessage}
          </div>
        )}
      </section>
      </div>

      <div className="space-y-6">
      <section className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">要約ブロックの整理</h3>
          <p className="text-sm text-muted-foreground">
            ブロック一覧で並び順を調整し、右側で選択中の要約を編集・改善します。
          </p>
        </header>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">ブロック一覧</h4>
              <span className="text-xs text-muted-foreground">{blocks.length} 件</span>
            </div>
            <div className="rounded-md border border-border bg-background">
              {blocks.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  範囲を適用すると要約ブロックが表示されます。
                </div>
              ) : (
                <div className="max-h-[520px] space-y-2 overflow-y-auto p-3 pr-2">
                  {draggingId && (
                    <DropZone
                      label="ここにドロップすると先頭へ移動します"
                      isActive={dragOverId === "start"}
                      onDragOver={handleDragOver}
                      onDragEnter={() => handleDropZoneEnter("start")}
                      onDragLeave={() => handleDropZoneLeave("start")}
                      onDrop={handleDropAtStart}
                    />
                  )}
                  {blocks.map((block) => {
                    const isSelected = block.blockId === selectedBlockId;
                    const isDragging = draggingId === block.blockId;
                    const isTarget = dragOverId === block.blockId;
                    return (
                      <button
                        key={block.blockId}
                        type="button"
                        draggable
                        onDragStart={(event) => handleDragStart(event, block.blockId)}
                        onDragOver={handleDragOver}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDropOnBlock(block.blockId);
                        }}
                        onDragEnter={() => handleDragEnter(block.blockId)}
                        onDragLeave={() => handleDragLeave(block.blockId)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedBlockId(block.blockId)}
                        className={cn(
                          "group flex w-full flex-col gap-2 rounded-md border border-border bg-background px-4 py-3 text-left transition",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isSelected && "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40",
                          isDragging && "cursor-grabbing opacity-60",
                          isTarget && "border-primary border-dashed bg-primary/10"
                        )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>順序 {block.order}</span>
                                <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground/40" />
                                <span>元チャンク番号 {block.entryId}</span>
                              </div>
                              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                                {block.summary || "（要約が入力されていません）"}
                              </p>
                            </div>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "select-none text-lg text-muted-foreground transition group-hover:text-foreground",
                              isDragging && "text-primary"
                            )}
                          >
                            ⋮⋮
                          </span>
                        </div>
                        {block.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                            {block.citations.map((citation) => (
                              <span
                                key={`${block.blockId}-${citation}`}
                                className="rounded-full bg-muted px-2 py-0.5"
                              >
                                引用 {citation}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {draggingId && (
                    <DropZone
                      label="ここにドロップすると末尾へ移動します"
                      isActive={dragOverId === "end"}
                      onDragOver={handleDragOver}
                      onDragEnter={() => handleDropZoneEnter("end")}
                      onDragLeave={() => handleDropZoneLeave("end")}
                      onDrop={handleDropAtEnd}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailView("edit")}
                aria-pressed={isEditView}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                  isEditView
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span>要約編集</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailView("source")}
                aria-pressed={!isEditView}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                  !isEditView
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>原文チェック</span>
              </button>
            </div>

            {isEditView ? (
              <>
                <div className="space-y-3 rounded-md border border-border bg-background px-4 py-4">
                  <header className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">要約の編集</h4>
                    <p className="text-xs text-muted-foreground">
                      左の一覧で選択したブロックの要約を編集します。変更は即座に保存されます。
                    </p>
                  </header>
                  {selectedBlock ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>順序 {selectedBlock.order}</span>
                        <span>元チャンク番号 {selectedBlock.entryId}</span>
                      </div>
                      <textarea
                        value={selectedBlock.summary}
                        onChange={(event) => handleSummaryChange(selectedBlock.blockId, event.target.value)}
                        rows={8}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>文字数 {selectedBlock.summary.length}</span>
                        <span>引用 {selectedBlock.citations.join(", ") || "なし"}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      左の一覧から編集したいブロックを選択してください。
                    </p>
                  )}
                </div>
                <div className="space-y-3 rounded-md border border-border bg-background px-4 py-4">
                  <header className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">表現のバリエーション</h4>
                    <p className="text-xs text-muted-foreground">
                      LLM案またはサンプル案を生成して、要約の表現を磨きます。
                    </p>
                  </header>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      生成の目的
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
                    disabled={isGeneratingVariations || !selectedBlock}
                    className={cn(
                      "inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
                      "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      (isGeneratingVariations || !selectedBlock) && "cursor-not-allowed opacity-60"
                    )}
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
              </>
            ) : (
              <div className="space-y-3 rounded-md border border-border bg-background px-4 py-4">
                <header className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">原文チェック</h4>
                  <p className="text-xs text-muted-foreground">
                    選択中のブロックに紐づく原文チャンクを確認できます。
                  </p>
                </header>
                <SourcePanel
                  entries={selectedContext}
                  highlightedIds={selectedBlock?.citations ?? []}
                  activeId={selectedBlock?.citations[0] ?? null}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">再構成要約</h3>
          <p className="text-sm text-muted-foreground">
            並べ替えた要約ブロックと引用情報を基に、新しい要約案を生成します。
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
            disabled={isReconstructing}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isReconstructing && "cursor-not-allowed opacity-60"
            )}
          >
            {isReconstructing ? "生成中…" : "この順序で要約を生成"}
          </button>
        </div>
        {reconstructionMessage && <p className="text-sm text-muted-foreground">{reconstructionMessage}</p>}
        <div className="min-h-[180px] whitespace-pre-wrap rounded-md border border-border/60 bg-background/80 p-4 text-sm leading-relaxed text-foreground">
          {reconstructionState ? (
            reconstructionState.summary
          ) : (
            <span className="text-muted-foreground">生成した再構成要約がここに表示されます。</span>
          )}
        </div>
        {reconstructionState?.mode === "sample" && (
          <p className="text-xs text-muted-foreground">
            OpenAI API キーが未接続のため、サンプル案を表示しています。
          </p>
        )}
      </section>
      </div>

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
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          const nextValue = Number.isNaN(parsed) ? min : parsed;
          onChange(Math.max(min, Math.min(max, nextValue)));
        }}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </label>
  );
}

type DropZoneProps = {
  label: string;
  isActive: boolean;
  onDrop: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
};

function DropZone({ label, isActive, onDrop, onDragOver, onDragEnter, onDragLeave }: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={cn(
        "rounded-md border border-dashed border-muted-foreground/60 px-4 py-3 text-center text-xs text-muted-foreground transition",
        isActive && "border-primary text-primary"
      )}
    >
      {label}
    </div>
  );
}
