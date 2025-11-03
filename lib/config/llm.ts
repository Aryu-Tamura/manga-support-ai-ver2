export const OPENAI_MODEL = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini";

export const SUMMARY_SYSTEM_PROMPT =
  "あなたは小説編集アシスタントです。指定されたテキスト断片を読み、重要な出来事・登場人物・感情の流れを押さえて日本語で要約してください。";

export const OVERALL_SUMMARY_PROMPT =
  "あなたは小説編集者です。与えられた本文を踏まえ、主要な出来事・舞台・主要登場人物・対立構造を含む400〜600文字の日本語要約を作成してください。";
