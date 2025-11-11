"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import {
  generatePictureBookDraftAction,
  generatePictureBookImageAction,
  savePictureBookPagesAction
} from "@/app/(dashboard)/projects/[projectKey]/picture-book/actions";
import {
  DEFAULT_PICTURE_BOOK_PAGE_COUNT,
  PICTURE_BOOK_PAGE_OPTIONS,
  buildInitialPictureBookPages,
  buildImagePrompt,
  clampCharacters,
  updatePageOrder,
  type PictureBookPage
} from "@/lib/picture-book/utils";
import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import { cn } from "@/lib/utils";
import { buildExportFilename } from "@/lib/picture-book/filename";

type PictureBookClientProps = {
  projectKey: string;
  projectTitle: string;
  entries: EntryRecord[];
  sentences: SummarySentence[];
  initialPages?: PictureBookPage[] | null;
  initialSource?: "llm" | "fallback" | "saved";
};

type SubTab = "editor" | "created";

function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function PictureBookClient({
  projectKey,
  projectTitle,
  entries,
  sentences,
  initialPages,
  initialSource
}: PictureBookClientProps) {
  const defaultPageCount = DEFAULT_PICTURE_BOOK_PAGE_COUNT;
  const initialPageList =
    initialPages && initialPages.length > 0
      ? initialPages
      : buildInitialPictureBookPages(sentences, entries, defaultPageCount);
  const [pageCount, setPageCount] = useState<number>(initialPageList.length || defaultPageCount);
  const pageCountRef = useRef<number>(initialPageList.length || defaultPageCount);
  const [pages, setPages] = useState<PictureBookPage[]>(initialPageList);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(pages[0]?.id ?? null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dialogueText, setDialogueText] = useState<string>("");
  const [narrationDraft, setNarrationDraft] = useState<string>("");
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<SubTab>("editor");
  const [exportingFormat, setExportingFormat] = useState<"docx" | "pdf" | null>(null);
  const skipNextPersistRef = useRef(true);
  const interactionDisabled = isDraftLoading;
  const isPreparingDraft = isDraftLoading;

  const totalPages = pages.length;

  useEffect(() => {
    if (initialPages && initialPages.length > 0) {
      pageCountRef.current = initialPages.length;
      setPageCount(initialPages.length);
      skipNextPersistRef.current = true;
      setPages(initialPages);
      setSelectedPageId(initialPages[0]?.id ?? null);
      setStatusMessage((current) => {
        if (initialSource === "llm") {
          return "LLMで生成した絵本ドラフトを読み込みました。";
        }
        if (initialSource === "saved") {
          return "保存済みの絵本ドラフトを読み込みました。";
        }
        return current ?? "プロジェクトデータを読み込み、絵本化レイアウトを初期化しました。";
      });
      setActiveTab("editor");
      setBatchProgress(0);
      setImageError(null);
      setImageNote(null);
    }
  }, [initialPages, initialSource]);

  useEffect(() => {
    if (!initialPages || initialPages.length === 0) {
      const draft = buildInitialPictureBookPages(sentences, entries, pageCountRef.current);
      skipNextPersistRef.current = true;
      setPages(draft);
      setSelectedPageId(draft[0]?.id ?? null);
      pageCountRef.current = draft.length;
      setPageCount(draft.length);
      setStatusMessage((current) => current ?? "プロジェクトデータを読み込み、絵本化レイアウトを初期化しました。");
      setActiveTab("editor");
      setBatchProgress(0);
      setImageError(null);
      setImageNote(null);
    }
  }, [entries, sentences, initialPages]);

  useEffect(() => {
    if (!pages.length) {
      setSelectedPageId(null);
      return;
    }
    if (!selectedPageId || !pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(pages[0]?.id ?? null);
    }
  }, [pages, selectedPageId]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId]
  );

  useEffect(() => {
    if (!selectedPage) {
      setDialogueText("");
      setNarrationDraft("");
      return;
    }
    setDialogueText(selectedPage.dialogues.join("\n"));
    setNarrationDraft(selectedPage.narration);
  }, [selectedPage]);

  const hasPageDraftChanges = useMemo(() => {
    if (!selectedPage) {
      return false;
    }
    const originalDialogues = selectedPage.dialogues.join("\n");
    return narrationDraft !== selectedPage.narration || dialogueText !== originalDialogues;
  }, [dialogueText, narrationDraft, selectedPage]);

  const persistPages = useCallback(
    async (nextPages: PictureBookPage[]) => {
      if (!nextPages.length) {
        return;
      }
      try {
        await savePictureBookPagesAction({
          projectKey,
          pages: nextPages
        });
      } catch (error) {
        console.error("絵本データの保存に失敗しました:", error);
      }
    },
    [projectKey]
  );

  useEffect(() => {
    skipNextPersistRef.current = true;
  }, [projectKey]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (!pages.length) {
      return;
    }
    void persistPages(pages);
  }, [pages, persistPages]);

  const confirmReset = useCallback(() => {
    if (!pages.length) {
      return true;
    }
    if (typeof window === "undefined") {
      return true;
    }
    return window.confirm("現在の編集内容が失われ、AIが絵本を再生成します。続行してもよろしいですか？");
  }, [pages]);

  const resetFeedback = useCallback(() => {
    setImageError(null);
    setImageNote(null);
  }, []);

  const requestDraft = useCallback(
    async (
      requestedCount: number,
      options: {
        onCancelled?: () => boolean;
        previousCount?: number;
        suppressReset?: boolean;
      } = {}
    ) => {
      const { onCancelled, previousCount, suppressReset } = options;
      const isCancelled = () => (onCancelled ? onCancelled() : false);

      if (!suppressReset) {
        resetFeedback();
      }
      setIsDraftLoading(true);
      setStatusMessage("AIが絵本の下書き準備中（1分ほどかかります）");
      setBatchProgress(0);
      setIsBatchGenerating(false);

      try {
        const result = await generatePictureBookDraftAction({
          projectKey,
          pageCount: requestedCount
        });
        if (isCancelled()) {
          return;
        }
        if (!result.ok || result.pages.length === 0) {
          setStatusMessage(
            result.ok
              ? "絵本ドラフトを構築できませんでした。プロジェクトデータを確認してください。"
              : result.message
          );
          if (typeof previousCount === "number") {
            pageCountRef.current = previousCount;
            setPageCount(previousCount);
          }
          return;
        }

        pageCountRef.current = result.pages.length;
        setPageCount(result.pages.length);
        setPages(result.pages);
        setSelectedPageId(result.pages[0]?.id ?? null);
        setActiveTab("editor");
        setImageError(null);
        setImageNote(null);
        setStatusMessage(
          result.source === "llm"
            ? "AIが絵本の下書きを準備しました。"
            : "プロジェクトデータをもとに絵本レイアウトを初期化しました。"
        );
      } catch (error) {
        if (!isCancelled()) {
          console.error("絵本ドラフトの読み込みに失敗しました:", error);
          setStatusMessage("絵本ドラフトの取得に失敗しました。時間をおいて再試行してください。");
          if (typeof previousCount === "number") {
            pageCountRef.current = previousCount;
            setPageCount(previousCount);
          }
        }
      } finally {
        if (!isCancelled()) {
          setIsDraftLoading(false);
        }
      }
    },
    [projectKey, resetFeedback]
  );

  const handlePageCountChange = (nextCount: number) => {
    if (interactionDisabled) {
      return;
    }
    if (nextCount === pageCount) {
      return;
    }
    if (!confirmReset()) {
      return;
    }
    const previousCount = pageCountRef.current;
    pageCountRef.current = nextCount;
    setPageCount(nextCount);
    setActiveTab("editor");
    void requestDraft(nextCount, { previousCount });
  };

  const handleExport = useCallback(
    async (format: "docx" | "pdf") => {
      if (!pages.length || exportingFormat) {
        return;
      }
      resetFeedback();
      setExportingFormat(format);
      const label = format === "docx" ? "Word" : "PDF";
      setStatusMessage(`${label}形式で絵本を出力しています…`);

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectKey)}/picture-book/export`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              format,
              projectTitle,
              pages: pages.map((page) => ({
                pageNumber: page.pageNumber,
                phase: page.phase,
                narration: page.narration,
                dialogues: page.dialogues,
                imageUrl: page.imageUrl
              }))
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          let message = `${label}形式の出力に失敗しました。`;
          try {
            const parsed = JSON.parse(errorText);
            if (parsed?.message) {
              message = parsed.message;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        const filename =
          response.headers.get("x-export-filename") ??
          buildExportFilename(projectTitle, projectKey, format);

        triggerFileDownload(blob, filename);
        setStatusMessage(`${label}ファイルをダウンロードしました。`);
      } catch (error) {
        console.error("絵本エクスポートに失敗しました:", error);
        setStatusMessage(
          error instanceof Error ? error.message : `${label}形式の出力に失敗しました。`
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [pages, projectKey, projectTitle, exportingFormat, resetFeedback]
  );

  const handleRegenerateDraft = () => {
    if (interactionDisabled) {
      return;
    }
    if (!confirmReset()) {
      return;
    }
    const currentCount = pageCountRef.current;
    void requestDraft(currentCount, { previousCount: currentCount });
  };

  const handleMovePage = (pageId: string, delta: number) => {
    if (interactionDisabled) {
      return;
    }
    setPages((prev) =>
      updatePageOrder(prev, (list) => {
        const index = list.findIndex((page) => page.id === pageId);
        if (index === -1) {
          return list;
        }
        const target = index + delta;
        if (target < 0 || target >= list.length) {
          return list;
        }
        const [moved] = list.splice(index, 1);
        list.splice(target, 0, moved);
        return list;
      })
    );
    setStatusMessage("ページの順序を調整しました。");
    setActiveTab("editor");
    resetFeedback();
  };

  const updateSelectedPage = (updater: (page: PictureBookPage) => PictureBookPage) => {
    if (!selectedPage) {
      return;
    }
    setPages((prev) =>
      prev.map((page) => (page.id === selectedPage.id ? updater(page) : page))
    );
    setActiveTab("editor");
  };

  const handleSavePageEdits = () => {
    if (interactionDisabled) {
      return;
    }
    if (!selectedPage) {
      return;
    }
    resetFeedback();
    const nextNarration = clampCharacters(narrationDraft.trim(), 200) || "シーンの概要を入力してください。";
    const lines = dialogueText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => clampCharacters(line, 100))
      .slice(0, 3);

    updateSelectedPage((page) => ({
      ...page,
      narration: nextNarration,
      dialogues: lines,
      imagePrompt: buildImagePrompt(page.phase, nextNarration)
    }));
    setNarrationDraft(nextNarration);
    setDialogueText(lines.join("\n"));
    setStatusMessage(`Page ${selectedPage.pageNumber} を保存しました。`);
  };

  const handleCreatePictureBook = () => {
    if (interactionDisabled) {
      return;
    }
    if (!pages.length || isBatchGenerating) {
      return;
    }
    resetFeedback();
    setActiveTab("editor");
    setIsBatchGenerating(true);
    setBatchProgress(0);
    setStatusMessage("全ページの画像を並行生成しています…");

    const snapshot = [...pages];

    const run = async () => {
      let lastNote: string | null = null;
      let completed = 0;
      let cancelled = false;
      const total = snapshot.length;

      const updateProgress = () => {
        if (cancelled) {
          return;
        }
        completed += 1;
        setBatchProgress(completed);
        setStatusMessage(`画像生成を進行中…（${completed}/${total}）`);
      };

      try {
        await Promise.all(
          snapshot.map(async (page) => {
            const response = await generatePictureBookImageAction({
              projectKey,
              pageNumber: page.pageNumber,
              prompt: page.imagePrompt,
              phase: page.phase
            });
            if (!response.ok) {
              throw new Error(`ページ ${page.pageNumber}: ${response.message}`);
            }

            if (response.note) {
              lastNote = response.note;
            }

            if (cancelled) {
              return;
            }

            setPages((prev) =>
              prev.map((item) =>
                item.id === page.id
                  ? {
                      ...item,
                      imageUrl: response.imageUrl
                    }
                  : item
              )
            );
            updateProgress();
          })
        );

        if (!cancelled) {
          setStatusMessage("全ページの画像生成が完了しました。");
          if (lastNote) {
            setImageNote(lastNote);
          }
          setActiveTab("created");
        }
      } catch (error) {
        cancelled = true;
        const message =
          error instanceof Error ? error.message : "画像生成中にエラーが発生しました。";
        setImageError(message);
        setStatusMessage(message);
      } finally {
        setIsBatchGenerating(false);
      }
    };

    void run();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/80 p-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
              activeTab === "editor"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
            aria-pressed={activeTab === "editor"}
            disabled={interactionDisabled}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("created")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
              activeTab === "created"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
            aria-pressed={activeTab === "created"}
            disabled={interactionDisabled}
          >
            生成した絵本
          </button>
        </div>
        {activeTab === "editor" ? (
          <button
            type="button"
            onClick={handleCreatePictureBook}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
              isBatchGenerating && "opacity-60"
            )}
            disabled={interactionDisabled || isBatchGenerating}
          >
            {isBatchGenerating
              ? `生成中…（${batchProgress}/${totalPages || 1}）`
              : "絵本を作る"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={interactionDisabled}
          >
            編集に戻る
          </button>
        )}
      </div>

      {statusMessage &&
        (isPreparingDraft ? (
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-base font-semibold text-primary">
            <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
            <span>{statusMessage}</span>
          </div>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {statusMessage}
            {isBatchGenerating && totalPages > 0 ? `（${batchProgress}/${totalPages}）` : ""}
          </p>
        ))}
      {imageError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {imageError}
        </p>
      )}
      {imageNote && (
        <p className="rounded-md border border-muted-foreground/40 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {imageNote}
        </p>
      )}
      {activeTab === "editor" ? (
        <>
          <section className="space-y-4 rounded-lg border border-border bg-card/70 p-6 shadow-sm">
            <header className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">ページ数と割付</h3>
              <p className="text-sm text-muted-foreground">
                起承転結のバランスを意識しながらページ数を選択し、自動割付を起点に編集を進めます。
              </p>
            </header>
            <div className="flex flex-wrap gap-2">
              {PICTURE_BOOK_PAGE_OPTIONS.map((option) => {
                const active = option === pageCount;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handlePageCountChange(option)}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background hover:bg-muted"
                    )}
                    aria-pressed={active}
                    disabled={interactionDisabled}
                  >
                    {option} ページ
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleRegenerateDraft}
                className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/60 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={interactionDisabled}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                絵本を再生成
              </button>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="space-y-4 rounded-lg border border-border bg-card/70 p-6 shadow-sm">
              <header className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">ページ一覧</h3>
                  <p className="text-sm text-muted-foreground">
                    ページを選択して右側で詳細を編集してください。順序は上下ボタンで調整できます。
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {projectTitle} / 全 {pages.length} ページ
                </span>
              </header>
              <div className="grid gap-3">
                {pages.map((page, index) => {
                  const selected = page.id === selectedPageId;
                  return (
                    <div
                      key={page.id}
                      className={cn(
                        "rounded-md border px-4 py-3 transition",
                        selected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-background hover:border-primary/60"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPageId(page.id)}
                        className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={interactionDisabled}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Page {page.pageNumber} / {page.phase}
                            </p>
                            <p className="text-sm leading-relaxed text-foreground">
                              {page.narration || "ナレーション未設定"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 text-muted-foreground">
                            <button
                              type="button"
                              className="rounded-full border border-transparent p-1 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleMovePage(page.id, -1);
                              }}
                              disabled={interactionDisabled || index === 0}
                              aria-label="前へ移動"
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-transparent p-1 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleMovePage(page.id, 1);
                              }}
                              disabled={interactionDisabled || index === pages.length - 1}
                              aria-label="後ろへ移動"
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </button>
                      {page.dialogues.length > 0 && (
                        <p className="mt-2 text-xs text-foreground">
                          {page.dialogues[0]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="space-y-6">
              <section className="space-y-4 rounded-lg border border-border bg-card/70 p-6 shadow-sm">
                {!selectedPage ? (
                  <p className="text-sm text-muted-foreground">
                    編集するページを左から選択してください。
                  </p>
                ) : (
                  <>
                    <header className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Page {selectedPage.pageNumber}
                        </p>
                        <h3 className="text-lg font-semibold tracking-tight">編集パネル</h3>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        起承転結: {selectedPage.phase}
                      </span>
                    </header>

                    <div className="space-y-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          ナレーション
                        </span>
                        <textarea
                          value={narrationDraft}
                          onChange={(event) => setNarrationDraft(event.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted/80"
                          placeholder="シーンの概要を入力してください。"
                          disabled={interactionDisabled}
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          セリフ
                        </span>
                        <textarea
                          value={dialogueText}
                          onChange={(event) => setDialogueText(event.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted/80"
                          placeholder="例：ジョバンニ：「星祭りはきっと盛大になるよ！」"
                          disabled={interactionDisabled}
                        />
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSavePageEdits}
                        className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={interactionDisabled || !hasPageDraftChanges}
                      >
                        変更を保存
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </>
      ) : (
        <section className="space-y-6 rounded-lg border border-border bg-card/80 p-6 shadow-sm">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">生成した絵本</h3>
              <p className="text-sm text-muted-foreground">
                生成された画像とナレーションを確認できます。必要に応じて「編集」に戻り細部を調整してください。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <span className="text-xs font-medium text-muted-foreground">全 {pages.length} ページ</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExport("docx")}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!pages.length || Boolean(exportingFormat)}
                >
                  {exportingFormat === "docx" ? "Word出力中…" : "Word出力"}
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("pdf")}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!pages.length || Boolean(exportingFormat)}
                >
                  {exportingFormat === "pdf" ? "PDF出力中…" : "PDF出力"}
                </button>
              </div>
            </div>
          </header>
          <div className="grid gap-6">
            {pages.map((page) => (
              <article
                key={page.id}
                className="grid gap-4 rounded-lg border border-border bg-card/90 p-4 shadow-sm lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]"
              >
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                  {page.imageUrl ? (
                    <Image
                      src={page.imageUrl}
                      alt={`Page ${page.pageNumber} / ${page.phase}`}
                      width={1024}
                      height={768}
                      className="h-full w-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">画像未生成</span>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Page {page.pageNumber} / {page.phase}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {page.narration || "ナレーション未入力"}
                    </p>
                  </div>
                  {page.dialogues.length > 0 && (
                    <div className="space-y-1">
                      {page.dialogues.map((line, index) => (
                        <p key={`${page.id}-dialogue-${index}`} className="text-sm text-foreground">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!pages.length && (
            <p className="text-sm text-muted-foreground">ページが設定されていません。編集に戻って構成を作成してください。</p>
          )}
        </section>
      )}
    </div>
  );
}
