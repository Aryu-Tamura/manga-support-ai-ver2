import { z } from "zod";

export const SourceSpanSchema = z.object({
  start: z.number().int(),
  end: z.number().int()
});

export type SourceSpan = z.infer<typeof SourceSpanSchema>;

export const SummarySentenceSchema = z.object({
  text: z.string(),
  citations: z.array(z.number().int())
});

export type SummarySentence = z.infer<typeof SummarySentenceSchema>;

export const EntryRecordSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  type: z.string(),
  speakers: z.array(z.string()),
  time: z.string(),
  location: z.string(),
  tone: z.string(),
  emotion: z.string(),
  action: z.string(),
  entities: z.array(z.string()),
  sourceSpan: SourceSpanSchema,
  summary: z.string().optional().default("")
});

export type EntryRecord = z.infer<typeof EntryRecordSchema>;

export const CharacterRecordSchema = z.object({
  Name: z.string().min(1),
  Role: z.string().optional().default(""),
  Details: z.string().optional().default("")
});

export type CharacterRecord = z.infer<typeof CharacterRecordSchema>;

export const ProjectDefinitionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  panelFile: z.string().min(1),
  characterFile: z.string().min(1)
});

export type ProjectDefinition = z.infer<typeof ProjectDefinitionSchema>;

export const ProjectSummarySchema = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string().optional().default("")
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectDataSchema = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string().optional().default(""),
  summarySentences: z.array(SummarySentenceSchema).optional().default([]),
  summaryUpdatedAt: z.string().optional().default(""),
  entries: z.array(EntryRecordSchema),
  characters: z.array(CharacterRecordSchema),
  fullText: z.string().optional().default(""),
  sourcePath: z.string().optional()
});

export type ProjectData = z.infer<typeof ProjectDataSchema>;