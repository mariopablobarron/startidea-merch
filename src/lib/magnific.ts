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
 * Remove Background — SÍNCRONO. Devuelve URLs directamente.
 * Body: { image_url: string }
 */
export async function removeBackground(
  cfg: MagnificConfig,
  imageUrl: string,
): Promise<{ ok: true; result: MagnificRemoveBgResponse } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(`${API_BASE}/v1/ai/remove-background`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ image_url: imageUrl }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as MagnificRemoveBgResponse;
    return { ok: true, result: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Upscale — ASÍNCRONO. Devuelve task_id.
 * Doc: /v1/ai/image-upscaler (creative upscaler)
 * Params típicos: image_url, scale_factor (2/4), creativity, hdr, resemblance.
 * Como no hay schema verificado, mandamos los más comunes y dejamos
 * `params` libres para que UI pueda añadir más.
 */
export async function upscaleImage(
  cfg: MagnificConfig,
  imageUrl: string,
  options: {
    scale_factor?: 2 | 4;
    creativity?: number; // 0-10
    hdr?: number;
    resemblance?: number;
    webhook_url?: string;
  } = {},
): Promise<{ ok: true; taskId: string; status: MagnificTaskStatus } | { ok: false; error: string; status?: number }> {
  try {
    const body: Record<string, unknown> = {
      image_url: imageUrl,
      scale_factor: options.scale_factor ?? 2,
      ...(options.creativity !== undefined ? { creativity: options.creativity } : {}),
      ...(options.hdr !== undefined ? { hdr: options.hdr } : {}),
      ...(options.resemblance !== undefined ? { resemblance: options.resemblance } : {}),
      ...(options.webhook_url ? { webhook_url: options.webhook_url } : {}),
    };
    const res = await fetch(`${API_BASE}/v1/ai/image-upscaler`, {
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
 */
export async function generateMystic(
  cfg: MagnificConfig,
  prompt: string,
  options: {
    resolution?: "1K" | "2K" | "4K";
    aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
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
