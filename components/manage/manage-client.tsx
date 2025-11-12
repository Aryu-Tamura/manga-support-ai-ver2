"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteProjectAction,
  createProjectFromUploadAction,
  updateProjectMetadataAction,
  relabelProjectAction
} from "@/app/(dashboard)/projects/manage/actions";
import { cn } from "@/lib/utils";

type ManageProject = {
  key: string;
  title: string;
  summary: string;
  chunkCount: number;
  characterCount: number;
  isSample: boolean;
};

type AuditEvent = {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  severity: "info" | "warning" | "error";
  message: string;
  meta?: Record<string, unknown>;
};

type ManageClientProps = {
  projects: ManageProject[];
  auditEvents: AuditEvent[];
};

type MessageState = {
  type: "success" | "error" | "info";
  text: string;
} | null;

const ACCEPTED_FILE_TYPES = [".txt", ".text", ".epub"];

export function ManageClient({ projects, auditEvents }: ManageClientProps) {
  const [forms, setForms] = useState(
    projects.map((project) => ({
      key: project.key,
      title: project.title,
      summary: project.summary
    }))
  );
  const [messages, setMessages] = useState<Record<string, MessageState>>({});
  const [globalMessage, setGlobalMessage] = useState<MessageState>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [expandedKey, setExpandedKey] = useState<string | null>(projects[0]?.key ?? null);

  const [uploadMessage, setUploadMessage] = useState<MessageState>(null);
  const uploadStepLabels = [
    "ファイルをアップロード",
    "本文解析とチャンク生成",
    "プロジェクトを登録"
  ];
  const [uploadSteps, setUploadSteps] = useState<number>(0);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [relabelHints, setRelabelHints] = useState<Record<string, string>>({});
  const [relabelChunkSizes, setRelabelChunkSizes] = useState<Record<string, number>>({});
  const [relabelKey, setRelabelKey] = useState<string | null>(null);
  const [isRelabeling, startRelabelTransition] = useTransition();

  const formMap = useMemo(() => new Map(forms.map((form) => [form.key, form])), [forms]);
  useEffect(() => {
    if (!expandedKey || !projects.some((project) => project.key === expandedKey)) {
      setExpandedKey(projects[0]?.key ?? null);
    }
  }, [projects, expandedKey]);

  const handleFieldChange = (key: string, field: "title" | "summary", value: string) => {
    setForms((prev) =>
      prev.map((form) =>
        form.key === key
          ? {
              ...form,
              [field]: value
            }
          : form
      )
    );
  };

  const handleUpdate = (project: ManageProject) => {
    const form = formMap.get(project.key);
    if (!form) {
      return;
    }
    setPendingKey(project.key);
    startUpdateTransition(async () => {
      const response = await updateProjectMetadataAction({
        key: project.key,
        title: form.title.trim(),
        summary: form.summary
      });
      setPendingKey(null);
      setMessages((prev) => ({
        ...prev,
        [project.key]: {
          type: response.ok ? "success" : "error",
          text: response.message
        }
      }));
      if (!response.ok) {
        setGlobalMessage({
          type: "error",
          text: response.message
        });
      } else {
        setGlobalMessage({
          type: "success",
          text: "プロジェクト一覧を更新しました。"
        });
      }
    });
  };

  const handleDelete = (project: ManageProject) => {
    if (deleteConfirmation !== project.key) {
      setDeleteConfirmation(project.key);
      setMessages((prev) => ({
        ...prev,
        [project.key]: {
          type: "info",
          text: "もう一度「削除する」を押すと確定します。"
        }
      }));
      return;
    }
    setPendingKey(project.key);
    startDeleteTransition(async () => {
      const response = await deleteProjectAction({ key: project.key });
      setPendingKey(null);
      setDeleteConfirmation(null);
      setMessages((prev) => ({
        ...prev,
        [project.key]: {
          type: response.ok ? "success" : "error",
          text: response.message
        }
      }));
      setGlobalMessage(
        response.ok
          ? { type: "success", text: "プロジェクト一覧を更新しました。" }
          : { type: "error", text: response.message }
      );
    });
  };

  const handleRelabel = (project: ManageProject) => {
    if (project.isSample) {
      return;
    }
    setRelabelKey(project.key);
    startRelabelTransition(async () => {
      const response = await relabelProjectAction({
        key: project.key,
        styleHint: relabelHints[project.key] ?? "",
        chunkTarget: relabelChunkSizes[project.key] ?? 250
      });
      setRelabelKey(null);
      setMessages((prev) => ({
        ...prev,
        [project.key]: {
          type: response.ok ? "success" : "error",
          text: response.message
        }
      }));
      setGlobalMessage(
        response.ok
          ? { type: "success", text: "再ラベルを実行し、最新のチャンクを保存しました。" }
          : { type: "error", text: response.message }
      );
      if (response.ok) {
        router.refresh();
      }
    });
  };

  const handleUploadSubmit = () => {
    if (!uploadTitle.trim() || !uploadFile) {
      setUploadMessage({
        type: "error",
        text: "作品タイトルと原作ファイルを選択してください。"
      });
      return;
    }
    setUploadMessage(null);
    startUploadTransition(async () => {
      setUploadSteps(1);
      try {
        const formData = new FormData();
        formData.append("title", uploadTitle.trim());
        formData.append("styleHint", "");
        formData.append("file", uploadFile, uploadFile.name);
        formData.append("chunkTarget", "250");
        setUploadSteps(2);
        const response = await createProjectFromUploadAction(formData);
        setUploadSteps(3);
        setUploadMessage({
          type: response.ok ? "success" : "error",
          text: response.message
        });
        if (response.ok) {
          setUploadTitle("");
          setUploadFile(null);
          setUploadFileName(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          setGlobalMessage({
            type: "info",
            text: "アップロード済みファイルは解析済みプロジェクトとして登録されました。"
          });
          router.refresh();
        }
      } finally {
        setUploadSteps(0);
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">新規プロジェクト</h3>
          <p className="text-sm text-muted-foreground">
            原作ファイルをアップロードすると、LLM がチャンク分割・要約・キャラクター抽出まで自動で実行し、新しいプロジェクトとして登録します。
          </p>
        </header>
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            解析はサーバー側で順次実行されます。OpenAI API キーが設定されていない場合はサンプル要約で登録されます。
          </div>

          <div className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                作品タイトル
              </span>
              <input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="例：転生したらスライムだった件"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            <label
              className="flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/60 bg-background/80 px-4 py-8 text-center text-sm text-muted-foreground hover:border-muted-foreground/80"
              style={{ cursor: "pointer" }}
            >
              <span className="font-medium">原作ファイルを選択</span>
              <span className="mt-1 text-xs">
                対応形式: {ACCEPTED_FILE_TYPES.map((ext) => ext.replace(".", "")).join(", ")}
              </span>
              <input
                type="file"
                accept={ACCEPTED_FILE_TYPES.join(",")}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setUploadFile(file);
                  setUploadFileName(file ? file.name : null);
                }}
                ref={fileInputRef}
              />
            </label>
            <div className="text-xs text-muted-foreground">
              {uploadFileName ? `選択済みファイル: ${uploadFileName}` : "ファイルが未選択です。"}
            </div>

            <button
              type="button"
              onClick={handleUploadSubmit}
              disabled={isUploading}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isUploading && "cursor-not-allowed opacity-60"
              )}
            >
              {isUploading ? "処理中…" : "LLM解析ジョブを起動"}
            </button>
            {uploadMessage && (
              <p
                className={cn(
                  "text-sm",
                  uploadMessage.type === "error" && "text-destructive",
                  uploadMessage.type === "success" && "text-emerald-600",
                  uploadMessage.type === "info" && "text-muted-foreground"
                )}
              >
                {uploadMessage.text}
              </p>
            )}
            {uploadSteps > 0 && (
              <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${(uploadSteps / uploadStepLabels.length) * 100}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {uploadStepLabels.map((label, index) => (
                    <li key={label} className={index < uploadSteps ? "text-foreground" : "text-muted-foreground"}>
                      {index + 1}. {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {globalMessage && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            globalMessage.type === "success" && "border-emerald-500/40 bg-emerald-100 text-emerald-700",
            globalMessage.type === "error" && "border-destructive bg-destructive/10 text-destructive",
            globalMessage.type === "info" && "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
          )}
        >
          {globalMessage.text}
        </div>
      )}

      <section className="space-y-4">
        <header className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">登録済みプロジェクト</h3>
          <p className="text-sm text-muted-foreground">
            プロジェクト名とサマリーの更新、削除（サンプル以外）が行えます。LLM を利用した再ラベルもここから実行できます。
          </p>
        </header>

        <div className="space-y-2">
          {projects.map((project) => {
            const form = formMap.get(project.key);
            const message = messages[project.key];
            const disabled = project.isSample;
            const isExpanded = expandedKey === project.key;
            return (
              <article
                key={project.key}
                className={cn(
                  "rounded-lg border border-border bg-card p-4 shadow-sm transition",
                  disabled && "opacity-90"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : project.key)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="flex flex-col">
                      <h4 className="text-base font-semibold text-foreground">{project.title}</h4>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        チャンク {project.chunkCount} / キャラクター {project.characterCount}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>
                  {project.isSample && (
                    <span className="rounded-full border border-muted-foreground/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                      サンプル（編集不可）
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="mt-4 space-y-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        プロジェクト名
                      </span>
                      <input
                        type="text"
                        value={form?.title ?? ""}
                        onChange={(event) => handleFieldChange(project.key, "title", event.target.value)}
                        disabled={disabled}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        作品サマリー
                      </span>
                      <textarea
                        value={form?.summary ?? ""}
                        onChange={(event) =>
                          handleFieldChange(project.key, "summary", event.target.value)
                        }
                        rows={4}
                        disabled={disabled}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        再ラベル用ヒント（任意）
                      </span>
                      <textarea
                        value={relabelHints[project.key] ?? ""}
                        onChange={(event) =>
                          setRelabelHints((prev) => ({
                            ...prev,
                            [project.key]: event.target.value
                          }))
                        }
                        rows={3}
                        disabled={disabled}
                        placeholder="キャラクターの補足・チャンク分割時に意識したい点など"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        再ラベル目標文字数（80〜600）
                      </span>
                      <input
                        type="number"
                        min={80}
                        max={600}
                        value={relabelChunkSizes[project.key] ?? 250}
                        onChange={(event) =>
                          setRelabelChunkSizes((prev) => ({
                            ...prev,
                            [project.key]: Number(event.target.value) || 250
                          }))
                        }
                        disabled={disabled}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
                      />
                    </label>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleUpdate(project)}
                        disabled={disabled || pendingKey === project.key || isUpdating}
                        className={cn(
                          "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition",
                          "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          (disabled || pendingKey === project.key || isUpdating) &&
                            "cursor-not-allowed opacity-60"
                        )}
                      >
                        {pendingKey === project.key && isUpdating ? "保存中…" : "保存する"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelabel(project)}
                        disabled={
                          disabled || relabelKey === project.key || isRelabeling || project.chunkCount === 0
                        }
                        className={cn(
                          "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition",
                          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          (disabled || relabelKey === project.key || isRelabeling || project.chunkCount === 0) &&
                            "cursor-not-allowed opacity-60"
                        )}
                      >
                        {relabelKey === project.key && isRelabeling ? "再ラベル中…" : "LLMで再ラベル"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(project)}
                        disabled={disabled || pendingKey === project.key || isDeleting}
                        className={cn(
                          "inline-flex items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-semibold text-destructive transition",
                          "hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2",
                          (disabled || pendingKey === project.key || isDeleting) &&
                            "cursor-not-allowed opacity-60"
                        )}
                      >
                        {pendingKey === project.key && isDeleting
                          ? "削除中…"
                          : deleteConfirmation === project.key
                            ? "削除を確定"
                            : "削除する"}
                      </button>
                    </div>

                    {message && (
                      <p
                        className={cn(
                          "text-sm",
                          message.type === "success" && "text-emerald-600",
                          message.type === "error" && "text-destructive",
                          message.type === "info" && "text-muted-foreground"
                        )}
                      >
                        {message.text}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {projects.length === 0 && (
            <div className="rounded-lg border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
              登録されたプロジェクトが見つかりませんでした。
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6 shadow-sm">
        <header className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">最近の操作ログ</h3>
          <p className="text-sm text-muted-foreground">
            最新のアップロード/編集/削除イベントを表示します（メモリ保持・ベータ版）。
          </p>
        </header>
        {auditEvents.length ? (
          <ul className="space-y-2 text-sm">
            {auditEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2"
              >
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                  <span className="rounded-full border border-muted-foreground/40 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {event.severity}
                  </span>
                  <span className="text-muted-foreground">{event.action}</span>
                </p>
                <p className="mt-1 text-foreground">{event.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">操作ログはまだありません。</p>
        )}
      </section>
    </div>
  );
}
