"use client";

import { useState } from "react";
import { SummaryClient } from "@/components/summary/summary-client";
import { SummaryPreview } from "@/components/summary/summary-preview";
import { CharacterClient } from "@/components/characters/character-client";
import type { CharacterContext } from "@/lib/characters/utils";
import type { SummarySentence, ProjectData } from "@/lib/projects/types";
import type { BasicInfoData } from "@/lib/summary/basic-info";

type SummaryEntry = {
  id: number;
  text: string;
  summary?: string;
};

type SummaryTabsProps = {
  project: ProjectData;
  projectKey: string;
  entries: SummaryEntry[];
  sentences: SummarySentence[];
  grainOptions: number[];
  basicInfo: BasicInfoData;
  characters: {
    name: string;
    role: string;
    details: string;
  }[];
  contexts: Record<string, CharacterContext[]>;
};

type TabId = "insight" | "partial";

const TABS: { id: TabId | "characters"; label: string }[] = [
  { id: "insight", label: "基本情報の理解" },
  { id: "partial", label: "部分要約" },
  { id: "characters", label: "キャラクター解析" }
];

export function SummaryTabs({
  project,
  projectKey,
  entries,
  sentences,
  grainOptions,
  basicInfo,
  characters,
  contexts
}: SummaryTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId | "characters">("insight");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "rounded-md px-4 py-2 text-sm font-semibold transition",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "insight" && <BasicInfoPanel info={basicInfo} />}
      {activeTab === "partial" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] 2xl:grid-cols-[minmax(0,480px)_1fr]">
          <SummaryClient
            projectKey={projectKey}
            projectTitle={project.title}
            chunkCount={project.entries.length}
            entries={entries}
            grainOptions={grainOptions}
            sourcePanelContainerId="summary-source-panel-root"
          />
          <div className="flex flex-col gap-6">
            <SummaryPreview project={project} />
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
              <header className="space-y-1">
                <h3 className="text-lg font-semibold tracking-tight">引用チャンク</h3>
                <p className="text-sm text-muted-foreground">
                  要約で使われたチャンクにジャンプして根拠をすばやく確認できます。
                </p>
              </header>
              <div id="summary-source-panel-root" className="min-h-[360px]" />
            </section>
          </div>
        </div>
      )}
      {activeTab === "characters" && (
        <CharacterClient
          projectKey={projectKey}
          projectTitle={project.title}
          characters={characters}
          contexts={contexts}
        />
      )}
    </div>
  );
}

type BasicInfoPanelProps = {
  info: BasicInfoData;
};

function BasicInfoPanel({ info }: BasicInfoPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard title="タイトル" body={info.title} />
      <InfoCard title="ジャンル" body={info.genre} />
      <InfoCard title="作品要約" body={info.synopsis} />
      <InfoCard title="世界観・舞台設定" body={info.world} />
    </div>
  );
}

type InfoCardProps = {
  title: string;
  body: string;
};

function InfoCard({ title, body }: InfoCardProps) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card/70 p-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{body}</p>
    </section>
  );
}
