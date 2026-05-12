/**
 * Cliente Metricool API — para programar y publicar piezas de contenido
 * en 9+ redes sociales (IG, FB, LinkedIn, X, TikTok, YouTube, Pinterest,
 * GMB, Threads) desde el Content Studio.
 *
 * Auth: header `X-Mc-Auth: <token>`. Token obtenido en
 * https://app.metricool.com/api → "Connect to your data".
 *
 * Endpoint principal usado:
 *   POST https://app.metricool.com/api/v1/scheduler/posts
 *     ?blogId={blogId}&userId={userId}
 *   Body: {
 *     text, accounts[], publicationDate, autoPublish: true, media[]
 *   }
 *
 * Doc oficial: https://app.metricool.com/api-doc
 *
 * En lugar de envs, leemos config desde tabla IntegrationConfig (provider=METRICOOL):
 *   {
 *     apiKey: "mc_...",
 *     userId: 12345,
 *     blogId: 67890,
 *     accounts: { IG: 111, FB: 222, LINKEDIN: 333, ... }
 *   }
 */

import { prisma } from "@/lib/prisma";

const API_BASE = "https://app.metricool.com/api";

export type MetricoolConfig = {
  apiKey: string;
  userId: number;
  blogId: number;
  accounts: Partial<Record<MetricoolChannel, number>>;
};

export type MetricoolChannel =
  | "IG"        // Instagram
  | "FB"        // Facebook
  | "LINKEDIN"
  | "X"         // Twitter/X
  | "TIKTOK"
  | "YOUTUBE"
  | "PINTEREST"
  | "THREADS"
  | "GMB";      // Google My Business

const CHANNEL_TO_METRICOOL: Record<MetricoolChannel, string> = {
  IG: "instagram",
  FB: "facebook",
  LINKEDIN: "linkedin",
  X: "twitter",
  TIKTOK: "tiktok",
  YOUTUBE: "youtube",
  PINTEREST: "pinterest",
  THREADS: "threads",
  GMB: "gmb",
};

export async function getMetricoolConfig(): Promise<MetricoolConfig | null> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "METRICOOL" },
  });
  if (!row || !row.enabled) return null;
  const cfg = row.config as Partial<MetricoolConfig>;
  if (!cfg?.apiKey || !cfg.userId || !cfg.blogId) return null;
  return {
    apiKey: cfg.apiKey,
    userId: cfg.userId,
    blogId: cfg.blogId,
    accounts: cfg.accounts || {},
  };
}

export async function testMetricoolConnection(
  cfg: MetricoolConfig,
): Promise<{ ok: true; brands: Array<{ id: number; label: string }> } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/admin/simpleProfiles?userId=${cfg.userId}`, {
      headers: { "X-Mc-Auth": cfg.apiKey },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return {
      ok: true,
      brands: Array.isArray(data)
        ? data.slice(0, 30).map((b: { id: number; label: string }) => ({
            id: b.id,
            label: b.label,
          }))
        : [],
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error red Metricool" };
  }
}

export type PublishPayload = {
  text: string;
  publicationDate: Date;
  channels: MetricoolChannel[];
  mediaUrls?: string[];          // URLs absolutas (PNG/JPG/MP4)
  link?: string;                  // URL para auto-shortening
  autoPublish?: boolean;          // default true
};

export type PublishResult =
  | { ok: true; externalIds: Record<string, string>; raw: unknown }
  | { ok: false; error: string };

/**
 * Programar/publicar una pieza en Metricool.
 * Convierte canales abstractos a IDs de accounts del blog del cliente.
 * Si autoPublish=true y publicationDate <= ahora, Metricool publica al instante.
 */
export async function publishToMetricool(
  cfg: MetricoolConfig,
  payload: PublishPayload,
): Promise<PublishResult> {
  // Resolver accounts: para cada canal pedido, obtener el accountId
  const accountIds: number[] = [];
  const missingChannels: string[] = [];
  for (const c of payload.channels) {
    const id = cfg.accounts[c];
    if (id) accountIds.push(id);
    else missingChannels.push(c);
  }
  if (accountIds.length === 0) {
    return {
      ok: false,
      error: `Sin accounts configurados para ${payload.channels.join(", ")}. Configura los IDs en /admin/integrations/metricool.`,
    };
  }

  const networkArray = payload.channels
    .map((c) => CHANNEL_TO_METRICOOL[c])
    .filter(Boolean);

  const body = {
    text: payload.text.slice(0, 2200), // tope IG/LinkedIn
    publicationDate: {
      dateTime: payload.publicationDate.toISOString().slice(0, 19),
      timezone: "Europe/Madrid",
    },
    autoPublish: payload.autoPublish ?? true,
    networks: networkArray,
    accounts: accountIds.map((id) => ({ id })),
    ...(payload.mediaUrls && payload.mediaUrls.length > 0
      ? { media: payload.mediaUrls.map((url) => ({ url })) }
      : {}),
    ...(payload.link ? { autoShortenLinks: true, postUrl: payload.link } : {}),
  };

  try {
    const url = `${API_BASE}/v1/scheduler/posts?blogId=${cfg.blogId}&userId=${cfg.userId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Mc-Auth": cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Metricool HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }
    const raw = await res.json();
    // Metricool devuelve un object con ID de la publicación (varía según versión).
    // Guardamos lo que devuelve para auditoría.
    const externalIds: Record<string, string> = {};
    if (raw && typeof raw === "object") {
      if (raw.id) externalIds.metricool = String(raw.id);
      if (Array.isArray(raw.posts)) {
        raw.posts.forEach((p: { network: string; id: string }) => {
          if (p.network) externalIds[p.network] = String(p.id);
        });
      }
    }
    return { ok: true, externalIds, raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error red Metricool" };
  }
}

/**
 * Para mostrar al admin qué canales tiene listos para publicar.
 */
export function configuredChannels(cfg: MetricoolConfig): MetricoolChannel[] {
  return (Object.keys(cfg.accounts) as MetricoolChannel[]).filter(
    (k) => cfg.accounts[k] != null,
  );
}

/**
 * Convierte ContentChannel de Prisma a MetricoolChannel.
 * Devuelve null si el canal no es publicable vía Metricool (EMAIL, WEB, ADS).
 */
export function contentChannelToMetricool(channel: string): MetricoolChannel | null {
  const map: Record<string, MetricoolChannel> = {
    IG: "IG",
    FB: "FB",
    LINKEDIN: "LINKEDIN",
    X: "X",
    TIKTOK: "TIKTOK",
    YOUTUBE: "YOUTUBE",
    PINTEREST: "PINTEREST",
  };
  return map[channel] || null;
}
