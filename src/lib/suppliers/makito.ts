import type {
  Product,
  StockLevel,
  SupplierAdapter,
  SyncResult,
} from "./types";

/**
 * Makito — feeds (XML/CSV) y B2B.
 * No publican una API REST formal: lo habitual es:
 *   - Feed XML/CSV de productos (autenticado con user/pass).
 *   - Feed CSV de stock + precios actualizado a diario.
 *
 * F1 plan: descarga del XML, parseo, normalización al shape común.
 * Sync nocturno (cron). Stock no tiempo real → revalidar manualmente
 * antes de confirmar pedidos grandes.
 */

const FEED_URL = process.env.MAKITO_FEED_URL || "";
const FEED_USER = process.env.MAKITO_FEED_USER || "";
const FEED_PASS = process.env.MAKITO_FEED_PASS || "";

function basicAuthHeader() {
  if (!FEED_USER || !FEED_PASS) return undefined;
  const token = Buffer.from(`${FEED_USER}:${FEED_PASS}`).toString("base64");
  return `Basic ${token}`;
}

export const makitoAdapter: SupplierAdapter = {
  code: "makito",
  name: "Makito",

  async ping() {
    if (!FEED_URL) return { ok: false, reason: "MAKITO_FEED_URL no configurada" };
    if (!FEED_USER || !FEED_PASS) return { ok: false, reason: "MAKITO_FEED_USER/PASS no configurados" };
    try {
      const res = await fetch(FEED_URL, {
        method: "HEAD",
        headers: basicAuthHeader() ? { Authorization: basicAuthHeader()! } : {},
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "fetch error" };
    }
  },

  async *fetchAllProducts(): AsyncIterable<Product> {
    if (!FEED_URL) throw new Error("MAKITO_FEED_URL no configurada");
    // TODO F1: descargar XML, parsear con fast-xml-parser, normalizar
    return;
  },

  async fetchProduct(supplierRef: string): Promise<Product | null> {
    void supplierRef;
    return null;
  },

  async fetchStock(skus: string[]): Promise<Record<string, StockLevel>> {
    void skus;
    return {};
  },
};

export async function syncMakito(): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  return {
    supplier: "makito",
    startedAt,
    finishedAt: new Date().toISOString(),
    productsFetched: 0,
    productsUpserted: 0,
    productsSkipped: 0,
    errors: [{ ref: "_", message: "Adapter aún no implementado (F1)" }],
  };
}
