"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SummarySentence, ProjectData } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

type SummaryPreviewProps = {
  project: ProjectData;
};

type SummaryPreviewUpdateDetail = {
  summary: string;
  sentences: SummarySentence[];
};

export function SummaryPreview({ project }: SummaryPreviewProps) {
  const { summarySentences = [], summary = "", entries } = project;
  const [previewSummary, setPreviewSummary] = useState(summary ?? "");
  const [previewSentences, setPreviewSentences] = useState<SummarySentence[]>(summarySentences);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  useEffect(() => {
    setPreviewSummary(summary ?? "");
  }, [summary]);

  useEffect(() => {
    setPreviewSentences(summarySentences);
  }, [summarySentences]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SummaryPreviewUpdateDetail>).detail;
      if (!detail) {
        return;
      }
      const nextSummary = typeof detail.summary === "string" ? detail.summary : "";
      const nextSentences = Array.isArray(detail.sentences) ? detail.sentences : [];
      setPreviewSummary(nextSummary);
      setPreviewSentences(nextSentences);
      const nextActiveCitation =
        nextSentences
          .flatMap((sentence) => sentence.citations ?? [])
          .find((citation) => typeof citation === "number") ?? null;
      setActiveCitation(nextActiveCitation);
    };

    window.addEventListener("summary:preview-update", handler as EventListener);
    return () => {
      window.removeEventListener("summary:preview-update", handler as EventListener);
    };
  }, []);

  const displaySentences = useMemo(
    () => buildDisplaySentences(previewSummary, previewSentences),
    [previewSummary, previewSentences]
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
    <div className="space-y-2 select-text text-sm leading-relaxed text-foreground">
      {sentences.map((sentence, sentenceIndex) => (
        <p key={`preview-${sentenceIndex}`} className="whitespace-pre-wrap select-text">
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
