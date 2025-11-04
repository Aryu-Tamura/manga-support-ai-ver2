import { promises as fs } from "node:fs";
import path from "node:path";
import { listProjectDefinitions, getProjectByKey } from "@/lib/projects/repository";
import type { ProjectDefinition } from "@/lib/projects/types";
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

function serializeEntries(project: Awaited<ReturnType<typeof getProjectByKey>>): unknown[] {
  if (!project) {
    return [];
  }
  return project.entries.map((entry) => ({
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
    entries: serializeEntries(project),
    full_text: project.fullText
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
    entries,
    full_text: fullText
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
  summary: string;
  entries: unknown[];
  fullText: string;
  characters: unknown[];
  title?: string;
}): Promise<void> {
  const { key, summary, entries, fullText, characters, title } = input;
  if (SAMPLE_PROJECT_KEYS.has(key)) {
    throw new Error("サンプルプロジェクトは編集できません。");
  }

  const definitions = await listProjectDefinitions();
  const target = definitions.find((item) => item.key === key);
  if (!target) {
    throw new Error("プロジェクト定義が見つかりません。");
  }

  const payload = {
    summary,
    entries,
    full_text: fullText
  };

  await fs.mkdir(path.dirname(target.panelFile), { recursive: true });
  await fs.writeFile(target.panelFile, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(target.characterFile, JSON.stringify(characters, null, 2), "utf-8");

  if (title) {
    const indexEntries = await readIndexFile();
    const found = indexEntries.find((entry) => entry.key === key);
    if (found) {
      found.title = title;
      await writeIndexFile(indexEntries);
    }
  }
}
