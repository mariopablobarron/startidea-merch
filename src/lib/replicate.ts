/**
 * Cliente Replicate API — IA imágenes pay-per-use.
 *
 * Auth: header `Authorization: Bearer r8_...`
 * Base: https://api.replicate.com/v1
 *
 * Patrón:
 *   - POST /v1/models/{owner}/{model}/predictions
 *     Body: { input: {...} }
 *     Devuelve { id, status, urls, output? }
 *   - GET /v1/predictions/{id}  — poll status
 *
 * Estados: starting → processing → succeeded | failed | canceled
 *
 * Modelos usados en TodoMerchandising:
 *   - Upscale: philz1337x/clarity-upscaler (calidad superior a real-esrgan)
 *   - Generate: black-forest-labs/flux-schnell (rápido y barato)
 *   - Remove BG: 851-labs/background-remover
 *
 * Costes orientativos (mayo 2026): ~$0.002-0.005/imagen vs ~$0.10-0.50 Magnific.
 */

import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.replicate.com/v1";

export type ReplicateConfig = {
  apiToken: string;
};

export type ReplicateStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

export type ReplicatePrediction = {
  id: string;
  status: ReplicateStatus;
  output: string | string[] | null;
  error: string | null;
  urls?: { get: string; cancel?: string };
};

// Modelos por defecto. Cambiables vía params si quisieras otro modelo.
export const REPLICATE_MODELS = {
  upscale: "philz1337x/clarity-upscaler",
  generate: "black-forest-labs/flux-schnell",
  removeBg: "851-labs/background-remover",
} as const;

export async function getReplicateConfig(): Promise<ReplicateConfig | null> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "REPLICATE" },
  });
  if (!row || !row.enabled) return null;
  const cfg = row.config as Partial<ReplicateConfig>;
  if (!cfg?.apiToken) return null;
  return { apiToken: cfg.apiToken };
}

function authHeaders(cfg: ReplicateConfig): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.apiToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Test rápido: GET /account devuelve datos de tu cuenta si la key es válida.
 */
export async function testReplicateConnection(
  cfg: ReplicateConfig,
): Promise<{ ok: true; username?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/account`, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "API token inválido (401/403)" };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = (await res.json()) as { username?: string };
    return { ok: true, username: data.username };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lanza una predicción usando el endpoint del modelo (resuelve "latest version"
 * automáticamente, sin necesidad de hash explícito).
 */
export async function createPrediction(
  cfg: ReplicateConfig,
  modelSlug: string, // "owner/model"
  input: Record<string, unknown>,
): Promise<
  | { ok: true; prediction: ReplicatePrediction }
  | { ok: false; error: string; status?: number }
> {
  try {
    const res = await fetch(`${API_BASE}/models/${modelSlug}/predictions`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ input }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as ReplicatePrediction;
    return { ok: true, prediction: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Poll status de una predicción.
 */
export async function getPredictionStatus(
  cfg: ReplicateConfig,
  predictionId: string,
): Promise<
  | { ok: true; prediction: ReplicatePrediction }
  | { ok: false; error: string; status?: number }
> {
  try {
    const res = await fetch(`${API_BASE}/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${cfg.apiToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 500)}`, status: res.status };
    }
    const data = (await res.json()) as ReplicatePrediction;
    return { ok: true, prediction: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Mapeo de status Replicate → status DB unificado.
 */
export function replicateStatusToDb(s: ReplicateStatus): "queued" | "processing" | "ready" | "failed" {
  switch (s) {
    case "starting": return "queued";
    case "processing": return "processing";
    case "succeeded": return "ready";
    case "failed":
    case "canceled":
      return "failed";
  }
}

/**
 * Extrae la primera URL del output (Replicate devuelve string o array según
 * el modelo).
 */
export function extractFirstOutputUrl(output: string | string[] | null): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  return output[0] ?? null;
}
