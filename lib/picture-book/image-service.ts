import { Buffer } from "node:buffer";
import type { PictureBookPhase } from "@/lib/picture-book/utils";

const GEMINI_DEFAULT_MODEL = "models/imagegeneration";
const GEMINI_CONCURRENCY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.GEMINI_IMAGE_CONCURRENCY ?? "3", 10) || 3
);
const GEMINI_BILLING_PROJECT =
  process.env.GEMINI_BILLING_PROJECT?.trim() ?? process.env.GEMINI_API_BILLING_PROJECT?.trim() ?? null;
const GEMINI_USE_USER_PROJECT_HEADER = parseBoolean(
  process.env.GEMINI_USE_USER_PROJECT_HEADER ?? process.env.GEMINI_ENABLE_USER_PROJECT_HEADER ?? "false"
);

let activeGeminiImageRequests = 0;
const pendingGeminiResolvers: Array<() => void> = [];

type GeneratePictureBookImageInput = {
  projectKey: string;
  pageNumber: number;
  prompt: string;
  phase: string;
};

export type PictureBookImageServiceResult =
  | {
      ok: true;
      imageUrl: string;
      note: string;
      mode: "gemini" | "sample";
    }
  | {
      ok: false;
      message: string;
    };

type GeminiInlineData = {
  inlineData?: {
    mimeType?: string;
    mime_type?: string;
    data?: string;
  };
  inline_data?: {
    mimeType?: string;
    mime_type?: string;
    data?: string;
  };
  fileData?: {
    mimeType?: string;
    mime_type?: string;
    fileUri?: string;
    file_uri?: string;
  };
  file_data?: {
    mimeType?: string;
    mime_type?: string;
    fileUri?: string;
    file_uri?: string;
  };
  image?: {
    inlineData?: {
      mimeType?: string;
      mime_type?: string;
      data?: string;
    };
    inline_data?: {
      mimeType?: string;
      mime_type?: string;
      data?: string;
    };
  };
  text?: string;
};

export async function generatePictureBookImage(
  input: GeneratePictureBookImageInput
): Promise<PictureBookImageServiceResult> {
  await acquireGeminiSlot();
  try {
    return await executeGeneratePictureBookImage(input);
  } finally {
    releaseGeminiSlot();
  }
}

async function executeGeneratePictureBookImage(
  input: GeneratePictureBookImageInput
): Promise<PictureBookImageServiceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildSampleImage(input, "GEMINI_API_KEY が未設定のため、プレースホルダー画像を返します。");
  }

  const configuredModel = process.env.GEMINI_IMAGE_MODEL?.trim();
  const model = normaliseGeminiModelName(configuredModel ?? GEMINI_DEFAULT_MODEL);
  const endpoint = process.env.GEMINI_API_ENDPOINT ?? "https://generativelanguage.googleapis.com/v1beta";
  const lowerModel = model.toLowerCase();
  const preferImageGeneration = /imagegeneration|image/.test(lowerModel);

  const attempts: Array<"content" | "image" | "legacy-image"> = preferImageGeneration
    ? ["image", "content", "legacy-image"]
    : ["content", "image", "legacy-image"];

  for (const attempt of attempts) {
    try {
      const result =
        attempt === "image"
          ? await callImageGenerationEndpoint({
              apiKey,
              endpoint,
              model,
              prompt: buildPrompt(input)
            })
          : attempt === "legacy-image"
          ? await callLegacyImageEndpoint({
              apiKey,
              endpoint,
              model,
              prompt: buildPrompt(input)
            })
          : await callGenerativeContentEndpoint({
              apiKey,
              endpoint,
              model,
              prompt: buildPrompt(input)
            });

      if (result.type === "success") {
        return {
          ok: true,
          imageUrl: result.imageUrl,
          note: result.note,
          mode: "gemini"
        };
      }
      if (result.type === "blocked") {
        return {
          ok: false,
          message: result.message
        };
      }
      if (result.type === "error") {
        // ログのみ出力し、別の経路があれば試行を継続
        console.warn(`Gemini ${attempt} エンドポイントでエラー: ${result.message}`);
      }
    } catch (error) {
      console.error(`Gemini ${attempt} エンドポイント呼び出しに失敗:`, error);
    }
  }

  console.warn("Gemini API のいずれのエンドポイントからも画像を取得できなかったためフォールバックします。");
  return buildSampleImage(
    input,
    "Gemini API から画像を取得できなかったため、プレースホルダー画像を返しました。"
  );
}

async function acquireGeminiSlot() {
  if (activeGeminiImageRequests < GEMINI_CONCURRENCY_LIMIT) {
    activeGeminiImageRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    pendingGeminiResolvers.push(() => {
      activeGeminiImageRequests += 1;
      resolve();
    });
  });
}

function releaseGeminiSlot() {
  if (activeGeminiImageRequests > 0) {
    activeGeminiImageRequests -= 1;
  }
  const next = pendingGeminiResolvers.shift();
  if (next) {
    next();
  }
}

function buildPrompt(input: GeneratePictureBookImageInput) {
  return [
    "以下の情報にもとづいて、絵本用1枚絵を生成してください。",
    `プロジェクト: ${input.projectKey}`,
    `ページ番号: ${input.pageNumber}`,
    `構成フェーズ: ${input.phase}`,
    "---- シーンの説明 ----",
    input.prompt,
    "---- 指示 ----",
    "構図やキャラクターデザインは日本のコミック調で、高解像度のカラービジュアルにしてください。",
    "1024x1024 の正方形キャンバスを前提に構図を調整し、上下左右が途切れないようにしてください。",
    "文字やウォーターマークは絶対に入れないでください。"
  ].join("\n");
}

function extractBlockReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const promptFeedback = (payload as Record<string, unknown>).promptFeedback;
  const promptFeedbackSnake = (payload as Record<string, unknown>).prompt_feedback;
  const feedback = [promptFeedback, promptFeedbackSnake].find(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object"
  );
  if (!feedback) {
    return null;
  }
  const reason = (feedback as Record<string, unknown>).blockReason;
  const reasonSnake = (feedback as Record<string, unknown>).block_reason;
  const finalReason = [reason, reasonSnake].find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return finalReason ?? null;
}

function extractInlineData(payload: unknown): { mimeType?: string; data?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") {
      continue;
    }
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const inlineData =
        (part as GeminiInlineData).inlineData ||
        (part as GeminiInlineData).inline_data ||
        (part as GeminiInlineData).image?.inlineData ||
        (part as GeminiInlineData).image?.inline_data;
      if (inlineData && typeof inlineData === "object" && typeof inlineData.data === "string") {
        return {
          mimeType: inlineData.mimeType ?? inlineData.mime_type ?? "image/png",
          data: inlineData.data
        };
      }
      const fallbackBase64 = findBase64Field(part);
      if (fallbackBase64) {
        return {
          mimeType: "image/png",
          data: fallbackBase64
        };
      }
    }
  }
  return null;
}

function extractFileUri(payload: unknown): { fileUri?: string; mimeType?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") {
      continue;
    }
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const fileData =
        (part as GeminiInlineData).fileData ||
        (part as GeminiInlineData).file_data;
      if (fileData && typeof fileData === "object") {
        return {
          fileUri: fileData.fileUri ?? (fileData as Record<string, unknown>).file_uri,
          mimeType: fileData.mimeType ?? (fileData as Record<string, unknown>).mime_type
        };
      }
    }
  }
  return null;
}

type EndpointRequest = {
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
};

type EndpointResult =
  | { type: "success"; imageUrl: string; note: string }
  | { type: "blocked"; message: string }
  | { type: "error"; message: string };

async function callGenerativeContentEndpoint(params: EndpointRequest): Promise<EndpointResult> {
  const { apiKey, endpoint, model, prompt } = params;
  const url = `${endpoint}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4
  };
  if (Object.keys(generationConfig).length > 0) {
    requestBody.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    return {
      type: "error",
      message: buildGeminiErrorMessage(response.status, errorText)
    };
  }

  const data: unknown = await response.json();
  const blockReason = extractBlockReason(data);
  if (blockReason) {
    return {
      type: "blocked",
      message: blockReason
    };
  }

  const inlineData = extractInlineData(data);
  if (inlineData?.data) {
    const mimeType = inlineData.mimeType ?? "image/png";
    return {
      type: "success",
      imageUrl: `data:${mimeType};base64,${inlineData.data}`,
      note: "Gemini API (generateContent) で画像を生成しました。"
    };
  }

  const fileData = extractFileUri(data);
  if (fileData?.fileUri) {
    return {
      type: "success",
      imageUrl: fileData.fileUri,
      note: "Gemini API (generateContent) から画像URIを取得しました。"
    };
  }

  console.warn("Gemini generateContent レスポンス解析に失敗:", safeJsonPreview(data));
  return {
    type: "error",
    message: "画像データがレスポンスに含まれていません。"
  };
}

async function callImageGenerationEndpoint(params: EndpointRequest): Promise<EndpointResult> {
  const { apiKey, endpoint, model, prompt } = params;
  const url = `${endpoint}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4
  };
  if (Object.keys(generationConfig).length > 0) {
    requestBody.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    return {
      type: "error",
      message: buildGeminiErrorMessage(response.status, errorText)
    };
  }

  const data: unknown = await response.json();
  const images = extractImagesFromGeneration(data);
  if (images.length > 0) {
    const { data: base64, mimeType } = images[0];
    if (base64 && base64.trim().length > 0) {
      return {
        type: "success",
        imageUrl: `data:${mimeType ?? "image/png"};base64,${base64}`,
        note: "Gemini API (imagegeneration) で画像を生成しました。"
      };
    }
  }

  const inlineData = extractInlineData(data);
  if (inlineData?.data) {
    return {
      type: "success",
      imageUrl: `data:${inlineData.mimeType ?? "image/png"};base64,${inlineData.data}`,
      note: "Gemini API (imagegeneration) で画像を生成しました。"
    };
  }

  console.warn("Gemini imagegeneration レスポンス解析に失敗:", safeJsonPreview(data));
  return {
    type: "error",
    message: "画像データがレスポンスに含まれていません。"
  };
}

async function callLegacyImageEndpoint(params: EndpointRequest): Promise<EndpointResult> {
  const { apiKey, endpoint, model, prompt } = params;
  const url = `${endpoint}/${model}:generate?key=${encodeURIComponent(apiKey)}`;
  const requestBody = {
    prompt: {
      text: prompt
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    return {
      type: "error",
      message: buildGeminiErrorMessage(response.status, errorText)
    };
  }

  const data: unknown = await response.json();
  const images = extractImagesFromGeneration(data);
  if (images.length > 0) {
    const { data: base64, mimeType } = images[0];
    if (base64 && base64.trim().length > 0) {
      return {
        type: "success",
        imageUrl: `data:${mimeType ?? "image/png"};base64,${base64}`,
        note: "Gemini API (legacy image endpoint) で画像を生成しました。"
      };
    }
  }

  return {
    type: "error",
    message: "画像データがレスポンスに含まれていません。"
  };
}

function extractImagesFromGeneration(payload: unknown): Array<{ data: string; mimeType?: string }> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results: Array<{ data: string; mimeType?: string }> = [];
  const candidates: unknown[] = [];

  const directImages = (payload as Record<string, unknown>).images;
  if (Array.isArray(directImages)) {
    candidates.push(...directImages);
  }

  const predictions = (payload as Record<string, unknown>).predictions;
  if (Array.isArray(predictions)) {
    for (const prediction of predictions) {
      if (prediction && typeof prediction === "object") {
        const predictionImages = (prediction as Record<string, unknown>).images;
        if (Array.isArray(predictionImages)) {
          candidates.push(...predictionImages);
        }
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const imageRecord = candidate as Record<string, unknown>;
    const inlineSource =
      (imageRecord.image as GeminiInlineData | undefined)?.inlineData ||
      (imageRecord.image as GeminiInlineData | undefined)?.inline_data ||
      (imageRecord as GeminiInlineData).inlineData ||
      (imageRecord as GeminiInlineData).inline_data;
    if (inlineSource?.data) {
      results.push({
        data: inlineSource.data,
        mimeType: inlineSource.mimeType ?? inlineSource.mime_type ?? "image/png"
      });
      continue;
    }
    const fallbackBase64 = findBase64Field(imageRecord);
    if (fallbackBase64) {
      results.push({
        data: fallbackBase64,
        mimeType: "image/png"
      });
    }
  }

  return results;
}

function findBase64Field(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findBase64Field(nested, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text ?? "";
  } catch (error) {
    console.warn("レスポンス本文の読み取りに失敗:", error);
    return "";
  }
}

function buildSampleImage(
  input: GeneratePictureBookImageInput,
  note: string
): PictureBookImageServiceResult {
  const svg = createPlaceholderSvg({
    phase: input.phase as PictureBookPhase,
    pageNumber: input.pageNumber,
    prompt: input.prompt
  });
  const base64 = Buffer.from(svg, "utf-8").toString("base64");
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  return {
    ok: true,
    imageUrl: dataUrl,
    note,
    mode: "sample"
  };
}

function createPlaceholderSvg(params: {
  phase: PictureBookPhase;
  pageNumber: number;
  prompt: string;
}) {
  const { phase, pageNumber, prompt } = params;
  const sanitizedPrompt = prompt.replace(/[<>&"]/g, "");
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="768" fill="url(#g)" />
  <rect x="32" y="32" width="960" height="704" rx="32" ry="32" fill="white" stroke="#cbd5f5" stroke-width="4"/>
  <text x="64" y="120" font-size="64" font-family="Noto Sans JP, sans-serif" fill="#1e293b">Page ${pageNumber}</text>
  <text x="64" y="190" font-size="48" font-family="Noto Sans JP, sans-serif" fill="#475569">フェーズ: ${phase}</text>
  <text x="64" y="260" font-size="28" font-family="Noto Sans JP, sans-serif" fill="#64748b">プロンプト概要:</text>
  <foreignObject x="64" y="300" width="896" height="380">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Noto Sans JP', sans-serif; font-size: 28px; color: #1e293b; line-height: 1.5;">
      ${escapeHtml(sanitizedPrompt).replace(/\n/g, "<br/>")}
    </div>
  </foreignObject>
  <text x="64" y="720" font-size="24" font-family="Noto Sans JP, sans-serif" fill="#94a3b8">
    Gemini 画像生成は未設定です。API連携後に差し替えてください。
  </text>
</svg>
`.trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normaliseGeminiModelName(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

function buildGeminiHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey
  };
  const billingProject = GEMINI_BILLING_PROJECT;
  if (billingProject && GEMINI_USE_USER_PROJECT_HEADER) {
    headers["X-Goog-User-Project"] = billingProject;
  }
  return headers;
}

function buildGeminiErrorMessage(status: number, errorText: string) {
  if (
    status === 403 &&
    (/USER_PROJECT_DENIED/i.test(errorText) || /serviceusage\.serviceUsageConsumer/i.test(errorText))
  ) {
    const parts = [
      "Gemini API の請求プロジェクトにアクセスできませんでした。",
      "Google Cloud コンソールで Generative Language API を有効化し、呼び出し元アカウントに roles/serviceusage.serviceUsageConsumer 権限を付与してください。"
    ];
    if (!GEMINI_BILLING_PROJECT || !GEMINI_USE_USER_PROJECT_HEADER) {
      parts.push(
        "環境変数 GEMINI_BILLING_PROJECT（または GEMINI_API_BILLING_PROJECT）と GEMINI_USE_USER_PROJECT_HEADER=true を設定すると、x-goog-user-project ヘッダーを付与できます。"
      );
    } else {
      parts.push(`現在設定されている請求プロジェクト: ${GEMINI_BILLING_PROJECT}`);
    }
    parts.push(
      "反映後、数分待ってから再度リクエストをお試しください。詳細: https://ai.google.dev/gemini-api/docs/troubleshooting"
    );
    return parts.join(" ");
  }
  return `HTTP ${status}: ${errorText}`;
}

function parseBoolean(source: string) {
  const normalised = source.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalised);
}

function safeJsonPreview(value: unknown) {
  try {
    return JSON.stringify(value)?.slice(0, 2000) ?? "";
  } catch (error) {
    return String(error);
  }
}
