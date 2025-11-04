"use client";

import { useCallback, useMemo, useState } from "react";
import type { SummarySentence, ProjectData } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

type SummaryPreviewProps = {
  project: ProjectData;
};

export function SummaryPreview({ project }: SummaryPreviewProps) {
  const { summarySentences = [], summary, entries } = project;
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  const sentenceList = useMemo(() => summarySentences, [summarySentences]);

  const displaySentences = useMemo(
    () => buildDisplaySentences(summary, sentenceList),
    [summary, sentenceList]
  );

  const handleCitationSelect = useCallback((citation: number) => {
    setActiveCitation(citation);
    notifyCitationSelect(citation);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">チャンク数</p>
        <p className="mt-1 text-2xl font-semibold">{entries.length}</p>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">脚注</p>
        <FootnoteList
          sentences={displaySentences}
          activeCitation={activeCitation}
          onSelect={handleCitationSelect}
        />
      </div>
      <div className="md:col-span-2 space-y-4">
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">要約</p>
          {displaySentences.length ? (
            <SummaryExcerpt
              sentences={displaySentences}
              activeCitation={activeCitation}
              onSelectCitation={handleCitationSelect}
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              要約がまだ登録されていません。要約生成後に表示されます。
            </p>
          )}
        </section>
        <p className="text-xs text-muted-foreground">
          脚注をクリックすると下部のチャンク一覧が該当箇所へスクロールします。
        </p>
      </div>
    </div>
  );
}

function buildDisplaySentences(summary: string | undefined, sentences: SummarySentence[]) {
  const normalizedSummary = (summary ?? "").trim();
  if (!normalizedSummary) {
    return sentences;
  }

  const fragments = normalizedSummary
    .split(/\r?\n/)
    .flatMap((segment) => segment.split(/(?<=[。！？!?]|\.)/))
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);

  if (!fragments.length) {
    return sentences;
  }

  const maxLength = Math.max(fragments.length, sentences.length);
  const result: SummarySentence[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const text = fragments[index] ?? sentences[index]?.text ?? "";
    if (!text) {
      continue;
    }
    const citations = sentences[index]?.citations ?? [];
    result.push({ text, citations });
  }

  return result;
}

function notifyCitationSelect(citation: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent("summary:citation-select", {
      detail: { citation }
    })
  );
}

type SummaryExcerptProps = {
  sentences: SummarySentence[];
  activeCitation: number | null;
  onSelectCitation: (citation: number) => void;
};

function SummaryExcerpt({ sentences, activeCitation, onSelectCitation }: SummaryExcerptProps) {
  if (!sentences.length) {
    return null;
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {sentences.map((sentence, sentenceIndex) => (
        <p key={`preview-${sentenceIndex}`} className="whitespace-pre-wrap">
          {sentence.text}
          {sentence.citations.map((citation, citationIndex) => {
            const isActive = citation === activeCitation;
            return (
              <button
                key={`${citation}-${citationIndex}`}
                type="button"
                aria-pressed={isActive}
                aria-label={`チャンク ${citation} へ移動`}
                onClick={() => onSelectCitation(citation)}
                className={cn(
                  "ml-1 inline-flex items-center rounded-sm border px-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/50 bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                [{citation}]
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}

type FootnoteListProps = {
  sentences: SummarySentence[];
  activeCitation: number | null;
  onSelect: (citation: number) => void;
};

function FootnoteList({ sentences, activeCitation, onSelect }: FootnoteListProps) {
  const citations = sentences.flatMap((sentence) => sentence.citations);
  if (!citations.length) {
    return <p className="text-sm text-muted-foreground">脚注情報がありません。</p>;
  }
  const unique = Array.from(new Set(citations)).sort((a, b) => a - b);
  return (
    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
      {unique.map((citation) => (
        <li key={citation}>
          <button
            type="button"
            onClick={() => onSelect(citation)}
            className={cn(
              "rounded border border-transparent px-2 py-1 text-left transition",
              citation === activeCitation
                ? "border-primary bg-primary/10 text-primary"
                : "hover:border-border hover:bg-muted/40"
            )}
          >
            チャンク {citation}
          </button>
        </li>
      ))}
    </ul>
  );
}