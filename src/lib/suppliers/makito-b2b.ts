/**
 * Cliente para la API B2B oficial de Makito (apis.makito.es).
 *
 * Distinto del cliente legacy en `makito.ts` (data.makito.es), que se
 * mantiene en paralelo para no romper sincronizaciones existentes.
 *
 * Auth: POST /access/auth/login con { clientId, clientSecret } → JWT bearer.
 *
 * Rate limiting interno: token bucket (capacidad 100, recarga 25/min) según
 * los límites publicados por Makito. Si nos quedamos sin tokens, esperamos
 * hasta que se recarguen — no devolvemos 429 al caller.
 *
 * Modo sandbox vs producción: se gestiona con AdminSetting (key `makito_b2b_mode`)
 * para poder alternar sin redeploy. Si el AdminSetting está vacío, por defecto
 * se usa `sandbox` para evitar que un test cree pedidos reales por error.
 *
 * Env vars (en /root/.env del VPS, cargadas por docker-compose env_file):
 *   - MAKITO_B2B_BASE                 (opcional, default https://apis.makito.es)
 *   - MAKITO_B2B_SANDBOX_CLIENT_ID
 *   - MAKITO_B2B_SANDBOX_CLIENT_SECRET
 *   - MAKITO_B2B_PROD_CLIENT_ID
 *   - MAKITO_B2B_PROD_CLIENT_SECRET
 *
 * NUNCA logamos las credenciales ni mencionamos "makito" en respuestas al
 * cliente. Solo aparece en admin y logs server-side.
 */
import { prisma } from "@/lib/prisma";
import { createTokenBucket } from "@/lib/suppliers/token-bucket";

const API_BASE = process.env.MAKITO_B2B_BASE || "https://apis.makito.es";

export type MakitoB2BMode = "sandbox" | "production";

export type MakitoB2BCredentials = {
  mode: MakitoB2BMode;
  clientId: string;
  clientSecret: string;
};

// ─── Mode toggle (persistido en AdminSetting) ────────────────────────────
export async function getMakitoB2BMode(): Promise<MakitoB2BMode> {
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "makito_b2b_mode" },
      select: { value: true },
    });
    const v = row?.value;
    if (v === "production" || v === "sandbox") return v;
  } catch {
    // BD no disponible o key no existe → default sandbox por seguridad
  }
  return "sandbox";
}

export async function setMakitoB2BMode(mode: MakitoB2BMode): Promise<void> {
  await prisma.adminSetting.upsert({
    where: { key: "makito_b2b_mode" },
    create: { key: "makito_b2b_mode", value: mode },
    update: { value: mode },
  });
  // invalidar caches en memoria por cambio de credenciales
  tokenCache = null;
}

export async function getActiveCredentials(): Promise<MakitoB2BCredentials> {
  const mode = await getMakitoB2BMode();
  const clientId =
    mode === "production"
      ? process.env.MAKITO_B2B_PROD_CLIENT_ID
      : process.env.MAKITO_B2B_SANDBOX_CLIENT_ID;
  const clientSecret =
    mode === "production"
      ? process.env.MAKITO_B2B_PROD_CLIENT_SECRET
      : process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credenciales Makito B2B (${mode}) no configuradas — pega MAKITO_B2B_${mode === "production" ? "PROD" : "SANDBOX"}_CLIENT_ID/SECRET en /root/.env del VPS`,
    );
  }
  return { mode, clientId, clientSecret };
}

// ─── Rate limiter (capacidad 100, recarga 25/min según docs Makito) ─────
// Si arrancáramos varios workers paralelos hay que mover esto a Redis —
// por ahora un solo proceso Next.js.
const rateBucket = createTokenBucket({
  capacity: 100,
  refillPerMinute: 25,
});

async function consumeToken(): Promise<void> {
  return rateBucket.consume();
}

export function getRateBucketStatus() {
  return rateBucket.status();
}

// ─── Auth JWT (cacheado in-memory) ───────────────────────────────────────
let tokenCache:
  | { token: string; obtainedAt: number; mode: MakitoB2BMode }
  | null = null;
// JWTs típicos duran 1h; refrescamos a los 50min para tener margen
const TOKEN_TTL_MS = 50 * 60_000;

async function loginB2B(creds: MakitoB2BCredentials): Promise<string> {
  await consumeToken(); // login también cuenta como petición
  const res = await fetch(`${API_BASE}/access/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Makito B2B login ${res.status} (${creds.mode}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token || data.token.length < 20) {
    throw new Error("Makito B2B login: respuesta sin token JWT válido");
  }
  return data.token;
}

async function getToken(forceRefresh = false): Promise<string> {
  const creds = await getActiveCredentials();
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.mode === creds.mode &&
    Date.now() - tokenCache.obtainedAt < TOKEN_TTL_MS
  ) {
    return tokenCache.token;
  }
  const token = await loginB2B(creds);
  tokenCache = { token, obtainedAt: Date.now(), mode: creds.mode };
  return token;
}

// ─── fetchB2B wrapper con auth + retry 401 + rate limit ──────────────────
export type FetchB2BOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Si true (default), añade ?format=JSON para forzar JSON en endpoints multi-formato */
  forceJson?: boolean;
};

export async function fetchB2B<T = unknown>(
  path: string,
  opts: FetchB2BOptions = {},
): Promise<T> {
  const { method = "GET", body, query = {}, forceJson = true } = opts;

  await consumeToken();
  const token = await getToken();

  const url = new URL(
    path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`,
  );
  if (forceJson && !url.searchParams.has("format")) {
    url.searchParams.set("format", "JSON");
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  let payload: string | undefined;
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res = await fetch(url.toString(), {
    method,
    headers,
    body: payload,
  });

  // 401 → token expirado: forzar refresh y reintentar una vez
  if (res.status === 401) {
    await consumeToken();
    const fresh = await getToken(true);
    headers.Authorization = `Bearer ${fresh}`;
    res = await fetch(url.toString(), { method, headers, body: payload });
  }

  if (!res.ok) {
    const bodyTxt = await res.text().catch(() => "");
    throw new Error(
      `Makito B2B ${method} ${path} → ${res.status}: ${bodyTxt.slice(0, 300)}`,
    );
  }

  // Algunos endpoints devuelven 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Makito B2B ${path}: respuesta no era JSON válido (${text.slice(0, 200)})`,
    );
  }
}

// ─── Helpers de conveniencia ─────────────────────────────────────────────

/** Lista de países ISO disponibles para envío. Endpoint ligero, ideal para ping. */
export async function getCountries() {
  return fetchB2B<unknown[]>("/orders/countries");
}

/** Lista de regiones (geo + comercial). */
export async function getRegions() {
  return fetchB2B<unknown[]>("/orders/regions");
}

/** Colores de marcaje disponibles. */
export async function getPrintColors() {
  return fetchB2B<unknown[]>("/orders/colors");
}

// ─── Discovery: file listings de los endpoints "feed" ────────────────────
// /catalog/files, /stock/files, /price-list/files, /print-config/files
// Estos endpoints devuelven URLs a archivos descargables — el formato
// concreto lo descubrimos en runtime (Fase 2 discovery, sin parser).

export async function getCatalogFiles() {
  return fetchB2B<unknown>("/catalog/files");
}

export async function getStockFiles() {
  return fetchB2B<unknown>("/stock/files");
}

export async function getPriceListFiles() {
  return fetchB2B<unknown>("/price-list/files");
}

export async function getPrintConfigFiles() {
  return fetchB2B<unknown>("/print-config/files");
}

/**
 * Descarga directa de uno de los archivos referenciados por los endpoints
 * /...files. Como las URLs pueden venir como path relativo a apis.makito.es
 * o como URL absoluta a un CDN, el caller debe pasar la URL completa.
 *
 * Útil para Fase 3 cuando ya sepamos qué formato manejamos. Por ahora
 * el descubrimiento se hace pidiendo solo los listings.
 */
export async function downloadFile(url: string): Promise<{
  status: number;
  contentType: string | null;
  contentLength: number | null;
  bodyPreview: string;
}> {
  await rateBucket.consume();
  const token = await getToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
  });
  const text = await res.text();
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    contentLength: text.length,
    bodyPreview: text.slice(0, 500),
  };
}
