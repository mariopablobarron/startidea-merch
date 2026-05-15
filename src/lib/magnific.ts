/**
 * Cliente Magnific API — IA imágenes (upscale, remove background, mystic,
 * relight, expand, style transfer) para piezas de marketing.
 *
 * Auth: header `x-magnific-api-key: <token>`.
 * Base: https://api.magnific.com
 * Docs: https://docs.magnific.com/llms.txt
 *
 * Patrones de API:
 *  - **Síncronos** (devuelven URLs directas en la respuesta):
 *      - remove-background
 *  - **Asíncronos** (devuelven task_id, polling GET):
 *      - mystic, image-upscaler, image-relight, image-expand, image-styletransfer
 *      - Estados: CREATED → IN_PROGRESS → COMPLETED | FAILED
 *      - GET /v1/ai/{endpoint}/{task-id}
 *
 * En lugar de .env, leemos config desde IntegrationConfig (provider=MAGNIFIC):
 *   { apiKey: "FPSX..." }
 */

import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.magnific.com";

export type MagnificConfig = {
  apiKey: string;
};

export type MagnificTaskStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type MagnificAsyncResponse = {
  data: {
    task_id: string;
    status: MagnificTaskStatus;
    generated?: string[]; // URLs de imágenes finales (cuando COMPLETED)
  };
};

export type MagnificRemoveBgResponse = {
  original: string;
  high_resolution: string;
  preview: string;
  url: string;
};

export async function getMagnificConfig(): Promise<MagnificConfig | null> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "MAGNIFIC" },
  });
  if (!row || !row.enabled) return null;
  const cfg = row.config as Partial<MagnificConfig>;
  if (!cfg?.apiKey) return null;
  return { apiKey: cfg.apiKey };
}

function authHeaders(cfg: MagnificConfig): HeadersInit {
  return {
    "x-magnific-api-key": cfg.apiKey,
    "Content-Type": "application/json",
  };
}

/**
 * Test rápido de credenciales: llamada GET barata (stock resources)
 * Si auth válida, devuelve 200; si inválida 401/403.
 */
export async function testMagnificConnection(
  cfg: MagnificConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/v1/resources/icons?limit=1`, {
      headers: { "x-magnific-api-key": cfg.apiKey },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "API key inválida (401/403)" };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Remove Background — DESACTIVADO 2026-05.
 *
 * El endpoint `/v1/ai/remove-background` documentado en magnific.com NO existe en
 * la API live para nuestra key (devuelve 404 mientras que un key inválido daría
 * 401). Probables causas: feature beta no expuesta en API pública, o requiere
 * plan superior. Si Magnific la habilita, restaurar.
 *
 * Mientras tanto la UI muestra esta funcionalidad como "no disponible".
 */
export async function removeBackground(
  _cfg: MagnificConfig,
  _imageUrl: string,
): Promise<{ ok: false; error: string; status?: number }> {
  return {
    ok: false,
    error:
      "Endpoint remove-background no disponible en la API pública de Magnific con tu plan actual. Disponibles: Upscaler, Mystic, Relight.",
    status: 501,
  };
}

/**
 * Upscale — ASÍNCRONO. Devuelve task_id.
 * Endpoint: POST /v1/ai/image-upscaler (también existe `/image-upscaler-precision`)
 *
 * Schema REAL verificado contra la API live (2026-05):
 *   - Campo de imagen: `image` (NO image_url) — URL pública
 *   - scale_factor: string "2x" | "4x" | "8x" | "16x" (NO numérico)
 *   - Devuelve { data: { task_id, status, generated: [] } }
 */
export type UpscaleScale = "2x" | "4x" | "8x" | "16x";

export async function upscaleImage(
  cfg: MagnificConfig,
  imageUrl: string,
  options: {
    scale_factor?: UpscaleScale;
    creativity?: number; // 0-10
    hdr?: number;
    resemblance?: number;
    webhook_url?: string;
    precision?: boolean; // si true usa el endpoint precision
  } = {},
): Promise<{ ok: true; taskId: string; status: MagnificTaskStatus } | { ok: false; error: string; status?: number }> {
  try {
    const body: Record<string, unknown> = {
      image: imageUrl,
      scale_factor: options.scale_factor ?? "2x",
      ...(options.creativity !== undefined ? { creativity: options.creativity } : {}),
      ...(options.hdr !== undefined ? { hdr: options.hdr } : {}),
      ...(options.resemblance !== undefined ? { resemblance: options.resemblance } : {}),
      ...(options.webhook_url ? { webhook_url: options.webhook_url } : {}),
    };
    const endpoint = options.precision ? "image-upscaler-precision" : "image-upscaler";
    const res = await fetch(`${API_BASE}/v1/ai/${endpoint}`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as MagnificAsyncResponse;
    return { ok: true, taskId: data.data.task_id, status: data.data.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Mystic — generación de imagen desde prompt (ultra-realista).
 *
 * Schema REAL verificado contra API live (2026-05):
 *   - resolution: lowercase "1k" | "2k" | "4k" (NO mayúscula)
 *   - aspect_ratio: nombres descriptivos (NO "1:1"). Valores aceptados:
 *       square_1_1, classic_4_3, traditional_3_4, widescreen_16_9,
 *       social_story_9_16, smartphone_horizontal_20_9, smartphone_vertical_9_20,
 *       film_horizontal_21_9, film_vertical_9_21, standard_3_2, portrait_2_3,
 *       horizontal_2_1, vertical_1_2, social_5_4, social_post_4_5
 *   - Devuelve { data: { task_id, status, generated, has_nsfw } }
 */
export type MysticResolution = "1k" | "2k" | "4k";
export type MysticAspectRatio =
  | "square_1_1"
  | "classic_4_3"
  | "traditional_3_4"
  | "widescreen_16_9"
  | "social_story_9_16"
  | "smartphone_horizontal_20_9"
  | "smartphone_vertical_9_20"
  | "film_horizontal_21_9"
  | "film_vertical_9_21"
  | "standard_3_2"
  | "portrait_2_3"
  | "horizontal_2_1"
  | "vertical_1_2"
  | "social_5_4"
  | "social_post_4_5";

export async function generateMystic(
  cfg: MagnificConfig,
  prompt: string,
  options: {
    resolution?: MysticResolution;
    aspect_ratio?: MysticAspectRatio;
    model?: string;
    structure_reference?: string;
    style_reference?: string;
    webhook_url?: string;
  } = {},
): Promise<{ ok: true; taskId: string; status: MagnificTaskStatus } | { ok: false; error: string; status?: number }> {
  try {
    const body: Record<string, unknown> = {
      prompt,
      ...(options.resolution ? { resolution: options.resolution } : {}),
      ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.structure_reference ? { structure_reference: options.structure_reference } : {}),
      ...(options.style_reference ? { style_reference: options.style_reference } : {}),
      ...(options.webhook_url ? { webhook_url: options.webhook_url } : {}),
    };
    const res = await fetch(`${API_BASE}/v1/ai/mystic`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as MagnificAsyncResponse;
    return { ok: true, taskId: data.data.task_id, status: data.data.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Poll status de cualquier task async.
 * El endpoint cambia según el tipo: /v1/ai/{kind}/{task-id}
 */
export async function getTaskStatus(
  cfg: MagnificConfig,
  kind: "mystic" | "image-upscaler" | "image-relight" | "image-expand" | "image-styletransfer",
  taskId: string,
): Promise<
  | { ok: true; status: MagnificTaskStatus; generated: string[] }
  | { ok: false; error: string; status?: number }
> {
  try {
    const res = await fetch(`${API_BASE}/v1/ai/${kind}/${taskId}`, {
      headers: { "x-magnific-api-key": cfg.apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as MagnificAsyncResponse;
    return { ok: true, status: data.data.status, generated: data.data.generated ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Mapea task type interno (DB) → endpoint Magnific.
 */
export function magnificEndpointForType(type: string): "mystic" | "image-upscaler" | "image-relight" | "image-expand" | "image-styletransfer" | null {
  switch (type) {
    case "mystic": return "mystic";
    case "upscale": return "image-upscaler";
    case "relight": return "image-relight";
    case "expand": return "image-expand";
    case "style-transfer": return "image-styletransfer";
    default: return null;
  }
}

/**
 * Mapea status Magnific (CREATED/IN_PROGRESS/COMPLETED/FAILED) → status DB (queued/processing/ready/failed)
 */
export function magnificStatusToDb(s: MagnificTaskStatus): "queued" | "processing" | "ready" | "failed" {
  switch (s) {
    case "CREATED": return "queued";
    case "IN_PROGRESS": return "processing";
    case "COMPLETED": return "ready";
    case "FAILED": return "failed";
  }
}
