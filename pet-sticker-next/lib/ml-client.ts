// ML 추론 서비스(pet-sticker-ml FastAPI) 호출 헬퍼.
// 서버(API route)에서만 사용한다. 모든 호출은 타임아웃 + graceful degradation 처리되어
// ML 서비스가 꺼져 있어도 Next 빌드/주문 흐름은 정상 동작한다.

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS ?? "3000");

export type MlReport =
  | {
      status: "ok";
      score: number;
      qualityClass: string;
      recommendation: string;
      confidence: number;
      modelVersion: string;
      requestId: string;
    }
  | { status: "unavailable"; reason: string };

export type ModelInfo =
  | {
      status: "ok";
      modelName: string;
      modelVersion: string;
      version: number;
      dataVersion: string;
      classes: string[];
      featureNames: string[];
      metrics: Record<string, number>;
      params: Record<string, unknown>;
      trainedAt: string;
    }
  | { status: "unavailable"; reason: string };

export type LogSummary =
  | ({ status: "ok" } & Record<string, unknown>)
  | { status: "unavailable"; reason: string };

export function mlServiceUrl(): string {
  return ML_SERVICE_URL;
}

async function mlFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${ML_SERVICE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    cache: "no-store",
  });
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "ML 서비스 호출 실패";
}

export async function requestQualityPrediction(
  image: Blob,
  filename = "image.png",
): Promise<MlReport> {
  try {
    const form = new FormData();
    form.append("image", image, filename);
    const response = await mlFetch("/predict", { method: "POST", body: form });
    if (!response.ok) {
      return { status: "unavailable", reason: `predict ${response.status}` };
    }
    const data = await response.json();
    return {
      status: "ok",
      score: data.score,
      qualityClass: data.qualityClass,
      recommendation: data.recommendation,
      confidence: data.confidence,
      modelVersion: data.modelVersion,
      requestId: data.requestId,
    };
  } catch (error) {
    return { status: "unavailable", reason: reason(error) };
  }
}

export async function getModelInfo(): Promise<ModelInfo> {
  try {
    const response = await mlFetch("/model/info", { method: "GET" });
    if (!response.ok) {
      return { status: "unavailable", reason: `model-info ${response.status}` };
    }
    const data = await response.json();
    return { status: "ok", ...data };
  } catch (error) {
    return { status: "unavailable", reason: reason(error) };
  }
}

export async function getLogSummary(): Promise<LogSummary> {
  try {
    const response = await mlFetch("/logs/summary", { method: "GET" });
    if (!response.ok) {
      return { status: "unavailable", reason: `logs ${response.status}` };
    }
    const data = await response.json();
    return { status: "ok", ...data };
  } catch (error) {
    return { status: "unavailable", reason: reason(error) };
  }
}

export async function sendFeedback(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await mlFetch("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}
