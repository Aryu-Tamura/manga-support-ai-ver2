import { OPENAI_MODEL } from "@/lib/config/llm";
import { getOpenAIClient } from "@/lib/server/openai";

export type LLMResult =
  | { ok: true; output: string }
  | { ok: false; message: string };

export async function runChatCompletion(messages: { role: "system" | "user"; content: string }[]) {
  const client = getOpenAIClient();
  if (!client) {
    return { ok: false as const, message: "OpenAI API キーが未設定です。" };
  }
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.3
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false as const, message: "LLMの応答が空でした。" };
    }
    return { ok: true as const, output: content };
  } catch (error) {
    console.error("LLM呼び出しに失敗:", error);
    return { ok: false as const, message: "LLM呼び出しに失敗しました。" };
  }
}
