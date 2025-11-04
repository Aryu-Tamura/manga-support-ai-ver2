"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { ChevronDown, ChevronUp, FileDown, Link, RefreshCw, X } from "lucide-react";
import { generatePictureBookImageAction } from "@/app/(dashboard)/projects/[projectKey]/picture-book/actions";
import { CitationList } from "@/components/shared/citation-list";
import { SourcePanel } from "@/components/summary/source-panel";
import {
  PICTURE_BOOK_PAGE_OPTIONS,
  PICTURE_BOOK_PHASES,
  buildInitialPictureBookPages,
  normaliseCitations,
  updatePageOrder,
  type PictureBookPage,
  type PictureBookPhase
} from "@/lib/picture-book/utils";
import type { EntryRecord, SummarySentence } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

type PictureBookClientProps = {
  projectKey: string;
  projectTitle: string;
  entries: EntryRecord[];
  sentences: SummarySentence[];
};

type SubTab = "editor" | "created";

export function PictureBookClient({
  projectKey,
  projectTitle,
  entries,
  sentences
}: PictureBookClientProps) {
  const defaultPageCount = PICTURE_BOOK_PAGE_OPTIONS[1] ?? 12;
  const [pageCount, setPageCount] = useState<number>(defaultPageCount);
  const pageCountRef = useRef<number>(defaultPageCount);
  const [pages, setPages] = useState<PictureBookPage[]>(() =>
    buildInitialPictureBookPages(sentences, entries, defaultPageCount)
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(pages[0]?.id ?? null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [citationText, setCitationText] = useState<string>("");
  const [dialogueText, setDialogueText] = useState<string>("");
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isGeneratingImage, startGenerateImage] = useTransition();
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<SubTab>("editor");

  const totalPages = pages.length;

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  useEffect(() => {
    const initialPages = buildInitialPictureBookPages(sentences, entries, pageCountRef.current);
    setPages(initialPages);
    setSelectedPageId(initialPages[0]?.id ?? null);
    setStatusMessage("プロジェクトデータを読み込み、絵本化レイアウトを初期化しました。");
    setActiveTab("editor");
    setBatchProgress(0);
    setImageError(null);
    setImageNote(null);
  }, [entries, sentences]);

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
      setCitationText("");
      setDialogueText("");
      setActiveCitation(null);
      return;
    }
    setCitationText(selectedPage.citations.join(", "));
    setDialogueText(selectedPage.dialogues.join("\n"));
    setActiveCitation(selectedPage.citations[0] ?? null);
  }, [selectedPage]);

  const selectedEntries = useMemo(() => {
    if (!selectedPage) {
      return [];
    }
    return selectedPage.citations
      .map((id) => entryMap.get(id))
      .filter((entry): entry is EntryRecord => Boolean(entry))
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        summary: entry.summary ?? ""
      }));
  }, [entryMap, selectedPage]);

  const confirmReset = useCallback(() => {
    if (!pages.length) {
      return true;
    }
    if (typeof window === "undefined") {
      return true;
    }
    return window.confirm("現在の編集内容がリセットされます。自動割付を再計算してもよろしいですか？");
  }, [pages]);

  const resetFeedback = () => {
    setImageError(null);
    setImageNote(null);
    setExportMessage(null);
  };

  const handlePageCountChange = (nextCount: number) => {
    if (nextCount === pageCount) {
      return;
    }
    if (!confirmReset()) {
      return;
    }
    const nextPages = buildInitialPictureBookPages(sentences, entries, nextCount);
    pageCountRef.current = nextCount;
    setPageCount(nextCount);
    setPages(nextPages);
    setSelectedPageId(nextPages[0]?.id ?? null);
    setStatusMessage(`ページ数を ${nextCount} 枚に変更し、自動割付を再計算しました。`);
    setActiveTab("editor");
    setBatchProgress(0);
    resetFeedback();
  };

  const handleAutoAllocate = () => {
    if (!confirmReset()) {
      return;
    }
    const nextPages = buildInitialPictureBookPages(sentences, entries, pageCount);
    setPages(nextPages);
    setSelectedPageId(nextPages[0]?.id ?? null);
    setStatusMessage("シーンの自動割付を再実行しました。");
    setActiveTab("editor");
    setBatchProgress(0);
    resetFeedback();
  };

  const handleMovePage = (pageId: string, delta: number) => {
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

  const handlePhaseChange = (phase: PictureBookPhase) => {
    resetFeedback();
    updateSelectedPage((page) => ({
      ...page,
      phase
    }));
  };

  const handleNarrationChange = (value: string) => {
    resetFeedback();
    updateSelectedPage((page) => ({
      ...page,
      narration: value
    }));
  };

  const handleImagePromptChange = (value: string) => {
    resetFeedback();
    updateSelectedPage((page) => ({
      ...page,
      imagePrompt: value
    }));
  };

  const handleImageUrlChange = (value: string) => {
    resetFeedback();
    updateSelectedPage((page) => ({
      ...page,
      imageUrl: value.trim().length > 0 ? value : null
    }));
  };

  const handleClearImage = () => {
    resetFeedback();
    updateSelectedPage((page) => ({
      ...page,
      imageUrl: null
    }));
    setStatusMessage("画像を未設定に戻しました。");
  };

  const handleDialogueApply = () => {
    if (!selectedPage) {
      return;
    }
    const lines = dialogueText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setPages((prev) =>
      prev.map((page) => (page.id === selectedPage.id ? { ...page, dialogues: lines } : page))
    );
    setStatusMessage("セリフ欄を更新しました。");
    setActiveTab("editor");
    resetFeedback();
  };

  const handleCitationsApply = () => {
    if (!selectedPage) {
      return;
    }
    const { valid, rejected } = parseCitationInput(citationText);
    const filtered = valid.filter((id) => entryMap.has(id));
    setPages((prev) =>
      prev.map((page) =>
        page.id === selectedPage.id
          ? {
              ...page,
              citations: normaliseCitations(filtered)
            }
          : page
      )
    );
    setActiveCitation(filtered[0] ?? null);
    if (filtered.length === 0) {
      setStatusMessage("引用チャンクが未設定です。該当する番号を入力してください。");
    } else if (rejected.length > 0) {
      setStatusMessage(`無効なチャンク番号を除外しました: ${rejected.join(", ")}`);
    } else {
      setStatusMessage("引用チャンクを更新しました。");
    }
    setActiveTab("editor");
    resetFeedback();
  };

  const handleGenerateImage = () => {
    if (!selectedPage) {
      return;
    }
    resetFeedback();
    startGenerateImage(async () => {
      const response = await generatePictureBookImageAction({
        projectKey,
        pageNumber: selectedPage.pageNumber,
        prompt: selectedPage.imagePrompt,
        phase: selectedPage.phase
      });
      if (!response.ok) {
        setImageError(response.message);
        return;
      }
      setPages((prev) =>
        prev.map((page) =>
          page.id === selectedPage.id
            ? {
                ...page,
                imageUrl: response.imageUrl
              }
            : page
        )
      );
      setImageNote(response.note);
      setStatusMessage(`Page ${selectedPage.pageNumber} の画像を更新しました。`);
    });
  };

  const handleCreatePictureBook = () => {
    if (!pages.length || isBatchGenerating) {
      return;
    }
    resetFeedback();
    setActiveTab("editor");
    setIsBatchGenerating(true);
    setBatchProgress(0);
    setStatusMessage("絵本生成を開始します…");

    const snapshot = [...pages];

    const run = async () => {
      let lastNote: string | null = null;
      for (let index = 0; index < snapshot.length; index += 1) {
        const page = snapshot[index];
        setStatusMessage(`ページ ${index + 1}/${snapshot.length} の画像を生成しています…`);
        const response = await generatePictureBookImageAction({
          projectKey,
          pageNumber: page.pageNumber,
          prompt: page.imagePrompt,
          phase: page.phase
        });
        if (!response.ok) {
          setImageError(response.message);
          setStatusMessage(`ページ ${page.pageNumber} の画像生成に失敗しました。`);
          setIsBatchGenerating(false);
          return;
        }
        lastNote = response.note;
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
        setBatchProgress(index + 1);
      }
      setStatusMessage("全ページの画像生成が完了しました。");
      if (lastNote) {
        setImageNote(lastNote);
      }
      setIsBatchGenerating(false);
      setActiveTab("created");
    };

    void run();
  };

  const handleGeneratePreviewLink = () => {
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const iso = expires.toISOString().slice(0, 10);
    const url = `https://preview.manga-support.ai/${projectKey}/picture-book?exp=${iso}`;
    setExportMessage(`レビュー用URL（モック）: ${url}`);
  };

  const handleGenerateWatermarkedPdf = () => {
    setExportMessage("透かし付きPDF出力は現在モックです。バックエンド接続後に有効化してください。");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/80 p-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeTab === "editor"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
            aria-pressed={activeTab === "editor"}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("created")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeTab === "created"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
            aria-pressed={activeTab === "created"}
          >
            新規作成
          </button>
        </div>
        {activeTab === "editor" ? (
          <button
            type="button"
            onClick={handleCreatePictureBook}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              (isBatchGenerating || isGeneratingImage) && "cursor-not-allowed opacity-60"
            )}
            disabled={isBatchGenerating || isGeneratingImage}
          >
            {isBatchGenerating
              ? `生成中…（${batchProgress}/${totalPages || 1}）`
              : "絵本を作る"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            編集に戻る
          </button>
        )}
      </div>

      {statusMessage && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {statusMessage}
          {isBatchGenerating && totalPages > 0 ? `（${batchProgress}/${totalPages}）` : ""}
        </p>
      )}
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
      {activeTab === "editor" && exportMessage && (
        <p className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {exportMessage}
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
                      "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background hover:bg-muted"
                    )}
                    aria-pressed={active}
                  >
                    {option} ページ
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleAutoAllocate}
                className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/60 px-4 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                シーンを自動割付
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
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Page {page.pageNumber} / {page.phase}
                            </p>
                            <p className="line-clamp-2 text-sm leading-relaxed text-foreground">
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
                              disabled={index === 0}
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
                              disabled={index === pages.length - 1}
                              aria-label="後ろへ移動"
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </button>
                      {page.dialogues.length > 0 && (
                        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                          セリフ例: {page.dialogues[0]}
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

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        フェーズ
                      </span>
                      <select
                        value={selectedPage.phase}
                        onChange={(event) => handlePhaseChange(event.target.value as PictureBookPhase)}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {PICTURE_BOOK_PHASES.map((phase) => (
                          <option key={phase} value={phase}>
                            {phase}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        画像プロンプト
                      </span>
                      <textarea
                        value={selectedPage.imagePrompt}
                        onChange={(event) => handleImagePromptChange(event.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleGenerateImage}
                          className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isGeneratingImage}
                        >
                          {isGeneratingImage ? (
                            "画像生成中…"
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4" aria-hidden />
                              画像を生成
                            </>
                          )}
                        </button>
                      </div>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        画像URL
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={selectedPage.imageUrl ?? ""}
                          onChange={(event) => handleImageUrlChange(event.target.value)}
                          placeholder="画像のURLを入力"
                          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          クリア
                        </button>
                      </div>
                      <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                        画像生成APIとの連携は未接続です。プロンプトとURLをメモとして使用してください。
                      </div>
                      {selectedPage.imageUrl && (
                        <div className="rounded-md border border-border bg-background p-3">
                          <Image
                            src={selectedPage.imageUrl}
                            alt={`${selectedPage.phase} シーンの参考画像`}
                            width={800}
                            height={600}
                            className="h-48 w-full rounded-md object-cover"
                            unoptimized
                          />
                        </div>
                      )}
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        ナレーション
                      </span>
                      <textarea
                        value={selectedPage.narration}
                        onChange={(event) => handleNarrationChange(event.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        セリフ候補
                      </span>
                      <textarea
                        value={dialogueText}
                        onChange={(event) => setDialogueText(event.target.value)}
                        onBlur={handleDialogueApply}
                        rows={3}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="1行につき1つのセリフを入力してください。"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        引用チャンク番号
                      </span>
                      <input
                        value={citationText}
                        onChange={(event) => setCitationText(event.target.value)}
                        onBlur={handleCitationsApply}
                        placeholder="例: 3, 12, 13"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <CitationList
                        citations={selectedPage.citations}
                        activeId={activeCitation}
                        onSelect={(id) => setActiveCitation(id)}
                        className="mt-1"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleGeneratePreviewLink}
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <Link className="h-4 w-4" aria-hidden />
                        レビュー用URL（モック）
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateWatermarkedPdf}
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <FileDown className="h-4 w-4" aria-hidden />
                        透かしPDF（モック）
                      </button>
                    </div>
                  </>
                )}
              </section>

              <SourcePanel
                entries={selectedEntries}
                highlightedIds={selectedPage?.citations ?? []}
                activeId={activeCitation}
              />
            </div>
          </div>
        </>
      ) : (
        <section className="space-y-6 rounded-lg border border-border bg-card/80 p-6 shadow-sm">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">生成した絵本</h3>
              <p className="text-sm text-muted-foreground">
                生成された画像とナレーションを確認できます。必要に応じて「編集」に戻り細部を調整してください。
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">全 {pages.length} ページ</span>
          </header>
          <div className="grid gap-6">
            {pages.map((page) => (
              <article
                key={page.id}
                className="grid gap-4 rounded-lg border border-border bg-card/90 p-4 shadow-sm lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]"
              >
                <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                  {page.imageUrl ? (
                    <Image
                      src={page.imageUrl}
                      alt={`Page ${page.pageNumber} / ${page.phase}`}
                      width={1024}
                      height={768}
                      className="h-full w-full object-cover"
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        セリフ候補
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {page.dialogues.map((line, index) => (
                          <li key={`${page.id}-dialogue-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <CitationList citations={page.citations} className="pt-1" />
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

function parseCitationInput(text: string): { valid: number[]; rejected: string[] } {
  if (!text.trim()) {
    return { valid: [], rejected: [] };
  }
  const tokens = text
    .split(/[,，\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const valid: number[] = [];
  const rejected: string[] = [];
  for (const token of tokens) {
    const value = Number.parseInt(token, 10);
    if (Number.isInteger(value)) {
      valid.push(value);
    } else {
      rejected.push(token);
    }
  }
  return { valid, rejected };
}
