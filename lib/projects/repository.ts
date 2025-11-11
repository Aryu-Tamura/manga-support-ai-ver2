import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CharacterRecordSchema,
  EntryRecordSchema,
  ProjectData,
  ProjectDataSchema,
  ProjectDefinition,
  ProjectDefinitionSchema,
  ProjectSummary,
  SourceSpan,
  SummarySentence,
  SummarySentenceSchema
} from "./types";
import {
  PictureBookStateSchema,
  type PictureBookState
} from "@/lib/picture-book/schema";

const DATA_ROOT = path.join(process.cwd(), "Streamlit", "data");
const INDEX_FILE = path.join(DATA_ROOT, "projects_index.json");

const BaseDefinitionSchema = z.object({
  key: z.string(),
  title: z.string(),
  panel_file: z.string(),
  character_file: z.string()
});

const RawEntrySchema = z
  .object({
    id: z.union([z.number().int(), z.string()]).optional(),
    text: z.string().optional(),
    type: z.string().optional(),
    speakers: z.array(z.union([z.string(), z.number()])).optional(),
    speaker: z.string().optional(),
    time: z.string().optional(),
    location: z.string().optional(),
    tone: z.string().optional(),
    emotion: z.string().optional(),
    action: z.string().optional(),
    entities: z.array(z.union([z.string(), z.number()])).optional(),
    source_span: z
      .object({
        start: z.number().optional(),
        end: z.number().optional()
      })
      .optional(),
    source_local_span: z
      .object({
        start: z.number().optional(),
        end: z.number().optional()
      })
      .optional(),
    summary: z.string().optional()
  })
  .passthrough();

const RawPanelFileSchema = z
  .object({
    summary: z.string().optional(),
    summary_sentences: z.array(z.unknown()).optional(),
    entries: z.array(RawEntrySchema).optional(),
    full_text: z.string().optional()
  })
  .passthrough();

const RawCharacterSchema = CharacterRecordSchema.extend({
  Name: CharacterRecordSchema.shape.Name.optional()
}).passthrough();

const RawCharacterArraySchema = z.array(RawCharacterSchema);

function resolveWithinDataRoot(targetPath: string): string {
  let candidate = targetPath;
  if (!path.isAbsolute(candidate)) {
    if (candidate.startsWith("data/") || candidate.startsWith("data\\")) {
      candidate = candidate.replace(/^data[\\/]/, "");
    }
    candidate = path.join(DATA_ROOT, candidate);
  }
  const resolved = candidate;
  const normalised = path.normalize(resolved);
  if (!normalised.startsWith(DATA_ROOT)) {
    throw new Error(`データパスが許可領域外です: ${targetPath}`);
  }
  return normalised;
}

async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`JSONファイルの読み込みに失敗: ${filePath}`, error);
    return null;
  }
}

function normaliseDefinition(definition: z.infer<typeof BaseDefinitionSchema>): ProjectDefinition {
  const panelFile = resolveWithinDataRoot(definition.panel_file);
  const characterFile = resolveWithinDataRoot(definition.character_file);
  return ProjectDefinitionSchema.parse({
    key: definition.key,
    title: definition.title,
    panelFile,
    characterFile
  });
}

function coerceSourceSpan(entry: z.infer<typeof RawEntrySchema>): SourceSpan {
  const fallback = { start: -1, end: -1 };
  const span = entry.source_span ?? entry.source_local_span;
  if (!span) {
    return fallback;
  }
  const start = typeof span.start === "number" ? span.start : fallback.start;
  const end = typeof span.end === "number" ? span.end : fallback.end;
  return { start, end };
}

function coerceSpeakers(entry: z.infer<typeof RawEntrySchema>): string[] {
  const values = entry.speakers ?? [];
  const normalised = [
    ...values.map((value) => String(value).trim()).filter(Boolean),
    ...(entry.speaker ? [entry.speaker.trim()] : [])
  ];
  const unique = Array.from(new Set(normalised));
  return unique;
}

function coerceEntities(entry: z.infer<typeof RawEntrySchema>): string[] {
  const raw = entry.entities ?? [];
  return Array.from(
    new Set(
      raw
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
    )
  );
}

function coerceId(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const digits = value.replace(/\D+/g, "");
    if (digits) {
      const parsed = Number.parseInt(digits, 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

function normaliseEntry(entry: z.infer<typeof RawEntrySchema>, index: number) {
  return EntryRecordSchema.parse({
    id: coerceId(entry.id, index + 1),
    text: entry.text ?? "",
    type: entry.type ?? "unknown",
    speakers: coerceSpeakers(entry),
    time: entry.time ?? "unknown",
    location: entry.location ?? "",
    tone: entry.tone ?? "neutral",
    emotion: entry.emotion ?? "neutral",
    action: entry.action ?? "",
    entities: coerceEntities(entry),
    sourceSpan: coerceSourceSpan(entry),
    summary: entry.summary ?? ""
  });
}

function normaliseCharacters(records: z.infer<typeof RawCharacterArraySchema>) {
  return records
    .map((record) =>
      CharacterRecordSchema.safeParse({
        Name: record.Name ?? "",
        Role: record.Role ?? "",
        Details: record.Details ?? ""
      })
    )
    .filter((result) => result.success && result.data.Name.trim().length > 0)
    .map((result) => result.data);
}

export async function listProjectDefinitions(): Promise<ProjectDefinition[]> {
  const baseDefinitions = [
    {
      key: "project1",
      title: "プロジェクト1：銀河鉄道の夜",
      panel_file: "gingatetudono_yoru_labeled.json",
      character_file: "character_gingatetudonoyoru.json"
    }
  ].map(normaliseDefinition);

  const extra = await readJsonFile<unknown>(INDEX_FILE);
  if (!extra) {
    return baseDefinitions.sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }

  const parsed = z
    .array(BaseDefinitionSchema)
    .safeParse(extra);
  if (!parsed.success) {
    console.warn("プロジェクト定義のパースに失敗しました。", parsed.error);
    return baseDefinitions.sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }

  const extras = parsed.data.map(normaliseDefinition);
  const merged = [
    ...baseDefinitions.filter(
      (base) => !extras.some((item) => item.key === base.key)
    ),
    ...extras
  ];

  return merged.sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const definitions = await listProjectDefinitions();
  const summaries: ProjectSummary[] = [];
  for (const definition of definitions) {
    const panel = await loadPanelFile(definition.panelFile);
    const summary = panel?.summary ?? "";
    summaries.push({
      key: definition.key,
      title: definition.title,
      summary
    });
  }
  return summaries;
}

async function loadPanelFile(panelPath: string) {
  const payload = await readJsonFile<unknown>(panelPath);
  if (!payload) {
    return null;
  }
  if (Array.isArray(payload)) {
    const entries = payload.map((item) => RawEntrySchema.parse(item ?? {}));
    return {
      summary: "",
      entries,
      full_text: ""
    };
  }
  const parsed = RawPanelFileSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn(`パネルデータのパースに失敗しました: ${panelPath}`, parsed.error);
    return null;
  }
  return parsed.data;
}

async function loadCharacterFile(characterPath: string) {
  const payload = await readJsonFile<unknown>(characterPath);
  if (!payload) {
    return [];
  }
  const parsed = RawCharacterArraySchema.safeParse(payload);
  if (!parsed.success) {
    console.warn(`キャラクターデータのパースに失敗しました: ${characterPath}`, parsed.error);
    return [];
  }
  return normaliseCharacters(parsed.data);
}

export async function getProjectByKey(key: string): Promise<ProjectData | null> {
  const definitions = await listProjectDefinitions();
  const definition = definitions.find((item) => item.key === key);
  if (!definition) {
    return null;
  }

  const panel = await loadPanelFile(definition.panelFile);
  if (!panel) {
    return null;
  }

  const entries = (panel.entries ?? []).map(normaliseEntry);
  const summarySentences = normalizeSummarySentences(panel.summary_sentences);
  const summaryUpdatedAt = typeof panel.summary_updated_at === "string" ? panel.summary_updated_at : "";
  const characters = await loadCharacterFile(definition.characterFile);
  const pictureBook = normalizePictureBookState(
    (panel as Record<string, unknown>).picture_book
  );

  const project = ProjectDataSchema.parse({
    key: definition.key,
    title: definition.title,
    summary: panel.summary ?? "",
    summarySentences,
    entries,
    characters,
    fullText: panel.full_text ?? "",
    summaryUpdatedAt,
    sourcePath: definition.panelFile,
    pictureBook
  });

  return project;
}

function normalizeSummarySentences(value: unknown): SummarySentence[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: SummarySentence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : "";
    const rawCitations = Array.isArray(record.citations) ? record.citations : [];
    const citations = rawCitations
      .map((citation) => {
        if (typeof citation === "number") {
          return citation;
        }
        if (typeof citation === "string") {
          const trimmed = citation.trim();
          const parsed = Number.parseInt(trimmed, 10);
          if (Number.isInteger(parsed)) {
            return parsed;
          }
        }
        return null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value));
    const parsed = SummarySentenceSchema.safeParse({
      text,
      citations
    });
    if (parsed.success) {
      result.push(parsed.data);
    }
  }
  return result;
}

function normalizePictureBookState(value: unknown): PictureBookState | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = PictureBookStateSchema.safeParse(value);
  if (!parsed.success) {
    console.warn("絵本データの読み込みに失敗しました。", parsed.error);
    return undefined;
  }
  return parsed.data;
}
