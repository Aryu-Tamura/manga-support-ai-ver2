"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { generateCharacterAnalysisAction } from "@/app/(dashboard)/projects/[projectKey]/characters/actions";
import { CitationList } from "@/components/shared/citation-list";
import { SourcePanel } from "@/components/summary/source-panel";
import { cn } from "@/lib/utils";
import type { CharacterContext } from "@/lib/characters/utils";

type CharacterItem = {
  name: string;
  role: string;
  details: string;
};

type CharacterClientProps = {
  projectKey: string;
  projectTitle: string;
  characters: CharacterItem[];
  contexts: Record<string, CharacterContext[]>;
};

type AnalysisState =
  | {
      analysis: string;
      citations: number[];
      mode: "llm" | "sample";
    }
  | null;

export function CharacterClient({
  projectKey,
  projectTitle,
  characters,
  contexts
}: CharacterClientProps) {
  const [selectedName, setSelectedName] = useState<string>(characters[0]?.name ?? "");
  const [analysisState, setAnalysisState] = useState<AnalysisState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  const activeCharacter = useMemo(
    () => characters.find((item) => item.name === selectedName) ?? null,
    [characters, selectedName]
  );
  const activeContexts = useMemo(
    () => contexts[selectedName] ?? [],
    [contexts, selectedName]
  );

  const handleGenerate = () => {
    if (!selectedName) {
      return;
    }
    setErrorMessage(null);
    setActiveCitation(null);
    startTransition(async () => {
      const response = await generateCharacterAnalysisAction({
        projectKey,
        characterName: selectedName
      });
      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }
      setAnalysisState({
        analysis: response.analysis,
        citations: response.citations,
        mode: response.mode
      });
    });
  };

  useEffect(() => {
    const citations = analysisState?.citations ?? [];
    if (!citations.length) {
      setActiveCitation(null);
      return;
    }
    setActiveCitation((current) => (current && citations.includes(current) ? current : citations[0]));
  }, [analysisState?.citations]);

  if (characters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-sm text-muted-foreground">
        キャラクター情報が登録されていません。Streamlit 版の管理画面から追加してからお試しください。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
          <header className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight">キャラクター情報</h3>
            <p className="text-sm text-muted-foreground">
              分析したいキャラクターを選択し、本文抜粋を確認してから解析メモを生成します。
            </p>
          </header>

          <div className="space-y-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                キャラクター
              </span>
              <select
                value={selectedName}
                onChange={(event) => {
                  setSelectedName(event.target.value);
                  setAnalysisState(null);
                  setErrorMessage(null);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {characters.map((character) => (
                  <option key={character.name} value={character.name}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>

            {activeCharacter && (
              <div className="rounded-md border border-border/60 bg-background/80 p-4">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">役割</dt>
                    <dd className="text-foreground">{activeCharacter.role || "未設定"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      詳細メモ
                    </dt>
                    <dd className="whitespace-pre-wrap leading-relaxed text-foreground">
                      {activeCharacter.details || "（補足情報なし）"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isPending && "cursor-not-allowed opacity-60"
              )}
              disabled={isPending}
            >
              {isPending ? "解析中…" : "キャラ解析を生成"}
            </button>
            {errorMessage && (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight">{projectTitle} / 解析結果</h3>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {analysisState?.mode === "llm"
                ? "LLMモード（OpenAI 連携）"
                : "サンプルモード（OpenAI未接続）"}
            </p>
          </header>
          <div className="min-h-[240px] rounded-md border border-border/60 bg-background/80 p-4 text-sm leading-relaxed text-foreground">
            {analysisState ? (
              <div className="whitespace-pre-wrap">{analysisState.analysis}</div>
            ) : (
              <p className="text-muted-foreground">
                キャラクターを選択し「キャラ解析を生成」を押すと、解析メモがここに表示されます。
              </p>
            )}
          </div>
          <CitationList
            citations={analysisState?.citations ?? []}
            activeId={activeCitation}
            onSelect={(id) => setActiveCitation(id)}
            className="rounded-md bg-muted/40 px-3 py-2"
          />
        </section>
      </div>

      <SourcePanel
        entries={activeContexts}
        highlightedIds={analysisState?.citations ?? []}
        activeId={activeCitation}
      />
    </div>
  );
}
