import { promises as fs } from "node:fs";
import path from "node:path";
import { listProjectDefinitions, getProjectByKey } from "@/lib/projects/repository";
import type { EntryRecord, ProjectDefinition, SummarySentence } from "@/lib/projects/types";
import type { PictureBookPage, PictureBookState } from "@/lib/picture-book/schema";
import { SAMPLE_PROJECT_KEYS } from "@/lib/projects/constants";

const DATA_ROOT = path.join(process.cwd(), "Streamlit", "data");
const INDEX_FILE = path.join(DATA_ROOT, "projects_index.json");

type IndexEntry = {
  key: string;
  title: string;
  panel_file: string;
  character_file: string;
};

function toRelativeDataPath(absolutePath: string): string {
  const relative = path.relative(DATA_ROOT, absolutePath);
  return `data/${relative.replace(/\\/g, "/")}`;
}

async function readIndexFile(): Promise<IndexEntry[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIndexFile(entries: IndexEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function serializeEntryRecords(entries: EntryRecord[]): unknown[] {
  return entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    type: entry.type,
    speakers: entry.speakers,
    time: entry.time,
    location: entry.location,
    tone: entry.tone,
    emotion: entry.emotion,
    action: entry.action,
    entities: entry.entities,
    source_span: entry.sourceSpan,
    summary: entry.summary
  }));
}

function serializeEntries(project: Awaited<ReturnType<typeof getProjectByKey>>): unknown[] {
  if (!project) {
    return [];
  }
  return serializeEntryRecords(project.entries);
}

function serializeSummarySentences(sentences: SummarySentence[]): unknown[] {
  return sentences.map((sentence) => ({
    text: sentence.text,
    citations: sentence.citations
  }));
}

function normalizeDefinition(definition: ProjectDefinition) {
  return {
    key: definition.key,
    title: definition.title,
    panelFile: definition.panelFile,
    characterFile: definition.characterFile
  };
}

export async function updateProjectMetadata(input: {
  key: string;
  title: string;
  summary: string;
}): Promise<void> {
  const { key, title, summary } = input;
  if (SAMPLE_PROJECT_KEYS.has(key)) {
    throw new Error("サンプルプロジェクトは編集できません。");
  }

  const definitions = await listProjectDefinitions();
  const definition = definitions.find((item) => item.key === key);
  if (!definition) {
    throw new Error("プロジェクト定義が見つかりません。");
  }
  const project = await getProjectByKey(key);
  if (!project) {
    throw new Error("プロジェクトデータが見つかりません。");
  }

  project.summary = summary;
  project.title = title;

  const payload = {
    summary,
    summary_sentences: serializeSummarySentences(project.summarySentences ?? []),
    summary_updated_at: project.summaryUpdatedAt || new Date().toISOString(),
    entries: serializeEntries(project),
    full_text: project.fullText,
    ...(project.pictureBook ? { picture_book: project.pictureBook } : {})
  };

  await fs.mkdir(path.dirname(definition.panelFile), { recursive: true });
  await fs.writeFile(definition.panelFile, JSON.stringify(payload, null, 2), "utf-8");

  const indexEntries = await readIndexFile();
  const existing = indexEntries.find((entry) => entry.key === key);
  if (existing) {
    existing.title = title;
    await writeIndexFile(indexEntries);
  } else {
    indexEntries.push({
      key,
      title,
      panel_file: toRelativeDataPath(definition.panelFile),
      character_file: toRelativeDataPath(definition.characterFile)
    });
    await writeIndexFile(indexEntries);
  }
}

export async function saveProjectSummaryResult(input: {
  key: string;
  summary: string;
  sentences: SummarySentence[];
  updatedAt: string;
}): Promise<void> {
  const { key, summary, sentences, updatedAt } = input;
  const project = await getProjectByKey(key);
  if (!project || !project.sourcePath) {
    throw new Error("プロジェクトが見つからないため要約を保存できません。");
  }

  const entrySummaries = buildEntrySummaryMap(sentences, project.entries);
  const updatedEntries = project.entries.map((entry) => {
    const nextSummary = entrySummaries.get(entry.id);
    return {
      ...entry,
      summary: nextSummary ?? entry.summary
    };
  });

  const payload = {
    summary,
    summary_sentences: serializeSummarySentences(sentences),
    summary_updated_at: updatedAt,
    entries: serializeEntryRecords(updatedEntries),
    full_text: project.fullText,
    ...(project.pictureBook ? { picture_book: project.pictureBook } : {})
  };

  await fs.mkdir(path.dirname(project.sourcePath), { recursive: true });
  await fs.writeFile(project.sourcePath, JSON.stringify(payload, null, 2), "utf-8");
}

async function removeDirectorySafe(targetPath: string) {
  if (!targetPath.startsWith(DATA_ROOT)) {
    return;
  }
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    console.warn("ディレクトリ削除に失敗しました:", targetPath, error);
  }
}

export async function deleteProject(key: string): Promise<void> {
  if (SAMPLE_PROJECT_KEYS.has(key)) {
    throw new Error("サンプルプロジェクトは削除できません。");
  }

  const definitions = await listProjectDefinitions();
  const target = definitions.find((item) => item.key === key);
  if (!target) {
    throw new Error("プロジェクト定義が見つかりません。");
  }

  const indexEntries = await readIndexFile();
  const filtered = indexEntries.filter((entry) => entry.key !== key);
  await writeIndexFile(filtered);

  const projectDir = path.dirname(target.panelFile);
  await removeDirectorySafe(projectDir);
}

export async function listManageableProjects(): Promise<
  Array<
    ReturnType<typeof normalizeDefinition> & {
      summary: string;
      chunkCount: number;
      characterCount: number;
      isSample: boolean;
    }
  >
> {
  const definitions = await listProjectDefinitions();
  const projects = await Promise.all(
    definitions.map(async (definition) => {
      const project = await getProjectByKey(definition.key);
      return {
        ...normalizeDefinition(definition),
        summary: project?.summary ?? "",
        chunkCount: project?.entries.length ?? 0,
        characterCount: project?.characters.length ?? 0,
        isSample: SAMPLE_PROJECT_KEYS.has(definition.key)
      };
    })
  );
  return projects;
}

export async function registerNewProject(input: {
  key: string;
  title: string;
  summary: string;
  panelPath: string;
  characterPath: string;
  entries: unknown[];
  fullText: string;
  characters: unknown[];
}): Promise<void> {
  const { key, title, summary, panelPath, characterPath, entries, fullText, characters } = input;
  const payload = {
    summary,
    summary_sentences: [],
    summary_updated_at: new Date().toISOString(),
    entries,
    full_text: fullText,
    picture_book: { pages: [] }
  };

  await fs.mkdir(path.dirname(panelPath), { recursive: true });
  await fs.writeFile(panelPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(characterPath, JSON.stringify(characters, null, 2), "utf-8");

  const definitions = await readIndexFile();
  const filtered = definitions.filter((item) => item.key !== key);
  filtered.push({
    key,
    title,
    panel_file: toRelativeDataPath(panelPath),
    character_file: toRelativeDataPath(characterPath)
  });

  await writeIndexFile(filtered);
}

export async function overwriteProjectData(input: {
  key: string;
  title: string;
  summary: string;
  entries: unknown[];
  fullText: string;
  characters: unknown[];
  summarySentences?: SummarySentence[];
  summaryUpdatedAt?: string;
  pictureBook?: PictureBookState;
}): Promise<void> {
  const {
    key,
    title,
    summary,
    entries,
    fullText,
    characters,
    summarySentences = [],
    summaryUpdatedAt,
    pictureBook
  } = input;

  if (SAMPLE_PROJECT_KEYS.has(key)) {
    throw new Error("サンプルプロジェクトは上書きできません。");
  }

  const definitions = await listProjectDefinitions();
  const definition = definitions.find((item) => item.key === key);
  if (!definition) {
    throw new Error("プロジェクト定義が見つかりません。");
  }

  const payload = {
    summary,
    summary_sentences: serializeSummarySentences(summarySentences),
    summary_updated_at: summaryUpdatedAt ?? new Date().toISOString(),
    entries: Array.isArray(entries) ? serializeEntryRecords(entries as EntryRecord[]) : [],
    full_text: fullText,
    ...(pictureBook ? { picture_book: pictureBook } : {})
  };

  await fs.mkdir(path.dirname(definition.panelFile), { recursive: true });
  await fs.writeFile(definition.panelFile, JSON.stringify(payload, null, 2), "utf-8");

  await fs.mkdir(path.dirname(definition.characterFile), { recursive: true });
  await fs.writeFile(definition.characterFile, JSON.stringify(characters ?? [], null, 2), "utf-8");

  const indexEntries = await readIndexFile();
  const existing = indexEntries.find((entry) => entry.key === key);
  const relativePanel = toRelativeDataPath(definition.panelFile);
  const relativeCharacter = toRelativeDataPath(definition.characterFile);

  if (existing) {
    existing.title = title;
    existing.panel_file = relativePanel;
    existing.character_file = relativeCharacter;
  } else {
    indexEntries.push({
      key,
      title,
      panel_file: relativePanel,
      character_file: relativeCharacter
    });
  }

  await writeIndexFile(indexEntries);
}

export async function saveProjectPictureBookPages(input: {
  key: string;
  pages: PictureBookPage[];
}): Promise<void> {
  const { key, pages } = input;
  const project = await getProjectByKey(key);
  if (!project || !project.sourcePath) {
    throw new Error("プロジェクトが見つからないため絵本を保存できません。");
  }
  const normalisedPages = pages.map((page, index) => ({
    ...page,
    pageNumber: index + 1
  }));

  let existingPayload: Record<string, unknown>;
  try {
    const raw = await fs.readFile(project.sourcePath, "utf-8");
    existingPayload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existingPayload = {
      summary: project.summary,
      summary_sentences: serializeSummarySentences(project.summarySentences ?? []),
      summary_updated_at: project.summaryUpdatedAt || new Date().toISOString(),
      entries: serializeEntries(project),
      full_text: project.fullText
    };
  }

  existingPayload.picture_book = { pages: normalisedPages };

  await fs.mkdir(path.dirname(project.sourcePath), { recursive: true });
  await fs.writeFile(project.sourcePath, JSON.stringify(existingPayload, null, 2), "utf-8");
}

const ENTRY_SUMMARY_LIMIT = 280;

function buildEntrySummaryMap(
  sentences: SummarySentence[],
  entries: EntryRecord[]
): Map<number, string> {
  const validEntryIds = new Set(entries.map((entry) => entry.id));
  const collected = new Map<number, string[]>();
  for (const sentence of sentences) {
    const text = sentence.text.trim();
    if (!text) {
      continue;
    }
    for (const citation of sentence.citations ?? []) {
      if (!Number.isInteger(citation) || !validEntryIds.has(citation)) {
        continue;
      }
      const list = collected.get(citation) ?? [];
      list.push(text);
      collected.set(citation, list);
    }
  }

  const result = new Map<number, string>();
  for (const [entryId, fragments] of collected) {
    const unique = Array.from(
      new Set(
        fragments
          .map((fragment) => fragment.trim())
          .filter((fragment) => fragment.length > 0)
      )
    );
    if (!unique.length) {
      continue;
    }
    const combined = unique.join(" / ");
    result.set(entryId, truncateSummary(combined, ENTRY_SUMMARY_LIMIT));
  }

  // Ensure entries without collected fragments are not present to preserve existing summaries.
  return result;
}

function truncateSummary(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…`;
}
