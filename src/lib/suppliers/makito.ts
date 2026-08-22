/**
 * Cliente API Makito (data.makito.es/api) + helpers para los feeds XML
 * (print.makito.es/user/xml/*).
 *
 * Dos canales:
 *   1. API REST con Bearer Token (Sanctum): catálogo paginado, precios,
 *      stock, técnicas marcaje, tarifa marcaje. Usado para sync incremental.
 *   2. Feeds XML autenticados con token URL: bulk download (productos 17 MB,
 *      stock 5.5 MB, precios 1.1 MB). Usado para sync inicial masivo.
 *
 * Auth:
 *   - API: POST /api/login con {email, password} → { msg: "ID|secret" }
 *     (formato Laravel Sanctum). El campo `msg` ES el bearer token.
 *   - Feeds XML: token UUID en query string `pszinternal=...`.
 *
 * Env vars:
 *   - MAKITO_API_EMAIL, MAKITO_API_PASSWORD → login
 *   - MAKITO_FEED_TOKEN → token URL feeds XML (pszinternal)
 *   - MAKITO_API_BASE (default https://data.makito.es/api)
 *   - MAKITO_FEED_BASE (default https://print.makito.es/user/xml)
 */

const API_BASE = process.env.MAKITO_API_BASE || "https://data.makito.es/api";
const FEED_BASE = process.env.MAKITO_FEED_BASE || "https://print.makito.es/user/xml";
const EMAIL = process.env.MAKITO_API_EMAIL || "";
const PASSWORD = process.env.MAKITO_API_PASSWORD || "";
const FEED_TOKEN = process.env.MAKITO_FEED_TOKEN || "";

// ─── Auth token cache (in-memory por proceso) ────────────────────────────
let cachedToken: { token: string; obtainedAt: number } | null = null;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min · Sanctum no expira pero rotamos

async function loginApi(): Promise<string> {
  if (!EMAIL || !PASSWORD) {
    throw new Error("MAKITO_API_EMAIL/PASSWORD no configurados");
  }
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Makito login ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { status?: number; msg?: string; token?: string };
  // La docs decía `token` pero el API real devuelve el bearer en `msg`
  // con formato "ID|secret". Aceptamos cualquiera de los dos por robustez.
  const tok = data.token || data.msg;
  if (!tok || tok.length < 20) {
    throw new Error(`Makito login sin token: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return tok;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() - cachedToken.obtainedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  const token = await loginApi();
  cachedToken = { token, obtainedAt: Date.now() };
  return token;
}

/**
 * Llamada genérica al API REST de Makito. Maneja:
 *   - Auth automático (login + cache + retry on 401)
 *   - JSON parse robusto
 */
async function callApi<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  async function doRequest(token: string): Promise<Response> {
    return fetch(url, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  }
  let token = await getToken();
  let res = await doRequest(token);
  // 401 → token caducado, re-login y retry una vez
  if (res.status === 401) {
    token = await getToken(true);
    res = await doRequest(token);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Makito ${init.method || "GET"} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Tope de vida de la descarga de un feed, **body incluido**.
 *
 * Sin `signal`, un feed que acepta la conexión y luego gotea deja el `fetch`
 * (y el `res.text()` de 17 MB que viene detrás) esperando indefinidamente: la
 * promesa del sync no se resuelve **ni se rechaza**, así que ningún `catch` la
 * ve y la fila de `SupplierSync` se queda abierta. Medido el 22-ago-2026: el
 * sync de makito arrancó a las 04:00, terminó los 4.479 productos a las 04:04
 * y a las 06:00 no había impreso **ni una línea más**, ni siquiera el
 * `console.error` del `.catch()` de su ruta.
 *
 * 10 min = ~2× el download más lento observado del XML grande.
 */
export const FEED_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Descarga un feed XML (raw text). El token va en query string.
 */
async function fetchFeedXml(endpoint: string): Promise<string> {
  if (!FEED_TOKEN) throw new Error("MAKITO_FEED_TOKEN no configurado");
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${FEED_BASE}${endpoint}${sep}pszinternal=${FEED_TOKEN}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml,text/xml" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Makito feed ${endpoint} → ${res.status}`);
  }
  const text = await res.text();
  if (text.length < 100 || !text.includes("<")) {
    throw new Error(`Makito feed ${endpoint} respuesta inválida (${text.length} bytes)`);
  }
  return text;
}

// ─── Types (subset de la respuesta API; campos opcionales por seguridad) ──

export type MakitoProduct = {
  ref: string;
  name?: string;
  printcode?: string;
  length?: string;
  height?: string;
  width?: string;
  diameter?: string;
  weight?: string;
  country_of_origin?: string;
  sizes?: string;
  colors?: string;
  brand?: string;
  intrastat?: string;
  // Packing levels (pf/pi1/pi2/ptc) + pallet
  ptc_units?: number;
  pallet_units?: number;
};

export type MakitoPriceTier = {
  ref: string;
  section_1?: number; price_1?: number;
  section_2?: number; price_2?: number;
  section_3?: number; price_3?: number;
  section_4?: number; price_4?: number;
  section_5?: number; price_5?: number;
  section_6?: number; price_6?: number;
};

export type MakitoStockItem = {
  matnr: string; // SKU único variante
  unique_ref?: string; // ref + color + talla
  ref?: string;
  stock_availability?: string;
  stock?: number;
  date?: string;
};

export type MakitoVariant = {
  matnr: string;
  unique_ref?: string;
  ref?: string;
  color?: string;
  size?: string;
  img100?: string;
};

export type MakitoMarkingTechnique = {
  ref: string; // ref producto
  technique_ref: string;
  name?: string;
  col_inc?: number; // color incluido (cuántos colores entran en price base)
  doublepass?: boolean;
  layer?: string;
  option?: string;
  mixture?: string;
  system?: string;
};

export type MakitoMarkingTechniquePrice = {
  technique_ref: string;
  code: string; // A, B, F, … (mismas familias que Cifra)
  // 10 tramos posibles (la mayoría usa 5)
  section_1: number; price_1: number; price_col_1: number; price_cm_1: number;
  section_2: number; price_2: number; price_col_2: number; price_cm_2: number;
  section_3: number; price_3: number; price_col_3: number; price_cm_3: number;
  section_4: number; price_4: number; price_col_4: number; price_cm_4: number;
  section_5: number; price_5: number; price_col_5: number; price_cm_5: number;
  section_6?: number; price_6?: number; price_col_6?: number; price_cm_6?: number;
  section_7?: number; price_7?: number; price_col_7?: number; price_cm_7?: number;
  section_8?: number; price_8?: number; price_col_8?: number; price_cm_8?: number;
  section_9?: number; price_9?: number; price_col_9?: number; price_cm_9?: number;
  section_10?: number; price_10?: number; price_col_10?: number; price_cm_10?: number;
  cliche?: number;
  cliche_repetition?: number;
  min?: number;
  min_unit?: number; // suelo €/ud (DTF: precio mínimo por unidad)
};

export type MakitoImage = {
  ref: string;
  img_min?: string;
  img_max?: string;
  main?: boolean;
};

// ─── Endpoints API REST (los usados por el sync) ──────────────────────────

/**
 * Lista paginada de productos. Endpoint útil pero LENTO para bulk
 * (~22500 requests con per_page=200). Para sync inicial usar el XML feed.
 */
export function fetchProductsPage(page: number, perPage = 100) {
  return callApi<{
    status_code: number;
    products: MakitoProduct[];
    page_info: { current_page: number; last_page: number; per_page: string; total: number };
  }>(`/products?page=${page}&per_page=${perPage}`);
}

/**
 * Todos los precios (un solo response, ~1.5 MB). percentIncrease=0 para
 * obtener tarifa neta sin recargo.
 */
export function fetchAllPrices(percentIncrease = 0) {
  return callApi<{ status_code: number; tarifs: MakitoPriceTier[] }>(
    `/prices/${percentIncrease}`,
  );
}

export function fetchVariantsByRef(ref: string) {
  return callApi<{ status_code: number; variants: MakitoVariant[] }>(`/variants/${ref}`);
}

export function fetchImagesByRef(ref: string) {
  return callApi<{ status_code: number; images: MakitoImage[] }>(`/images/${ref}`);
}

export function fetchStockByMatnrs(matnrs: string[]) {
  if (matnrs.length === 0) return Promise.resolve({ status_code: 200, stocks: [] as MakitoStockItem[] });
  const list = matnrs.join(",");
  return callApi<{ status_code: number; stocks: MakitoStockItem[] }>(
    `/stockVariants/${list}`,
  );
}

export function fetchMarkingTechniquesByRef(ref: string, lang = "esp") {
  return callApi<{ status_code: number; techniques: MakitoMarkingTechnique[] }>(
    `/markingTechniques/${lang}/${ref}`,
  );
}

/**
 * TARIFA REAL de marcaje (142 técnicas con 10 tramos + cliché + mínimo).
 * Esta es la pieza KEY de Makito vs Cifra (Cifra no tiene esto en API).
 */
export function fetchMarkingTechniquesPrices() {
  return callApi<{ status_code: number; techniques: MakitoMarkingTechniquePrice[] }>(
    `/markingTechniquesPrices`,
  );
}

export function fetchCategories(lang = "esp") {
  return callApi<{ status_code: number; categories: Array<{ ref: string; name: string }> }>(
    `/categories/${lang}`,
  );
}

// ─── Feeds XML ────────────────────────────────────────────────────────────

/** Catálogo masivo de productos en XML (17 MB español). */
export function fetchProductsXml(lang: "esp" | "ing" | "por" | "fra" | "ita" | "grm" | "hol" = "esp") {
  return fetchFeedXml(`/ItemDataFile.php?ldl=${lang}`);
}

/** Stock all-in-one (actualizado cada 2h). */
export function fetchStockXml() {
  return fetchFeedXml(`/allstockfile.php`);
}

/** Tarifa distribuidor productos en XML. */
export function fetchPricesXml() {
  return fetchFeedXml(`/PriceListFile.php`);
}

/** Técnicas/áreas marcaje por producto en XML. */
export function fetchPrintingXml(lang: "esp" | "ing" = "esp") {
  return fetchFeedXml(`/ItemPrintingFile.php?ldl=${lang}`);
}

/** Precios de marcado en XML. */
export function fetchMarkingPricesXml() {
  return fetchFeedXml(`/PrintJobsPrices.php`);
}

// ─── Adapter (compat con src/lib/suppliers/index.ts pingAll) ──────────────

export const makitoAdapter = {
  code: "makito" as const,
  name: "Makito",
  async ping(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!EMAIL || !PASSWORD) {
      return { ok: false, reason: "MAKITO_API_EMAIL/PASSWORD no configurados" };
    }
    try {
      await getToken(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "login error" };
    }
  },
};
