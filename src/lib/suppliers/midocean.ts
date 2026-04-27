import type {
  Product,
  StockLevel,
  SupplierAdapter,
  SyncResult,
} from "./types";

/**
 * MidOcean — Customer API.
 * Docs: https://www.midocean.com/export/us/eur/content/page.customer.api
 *
 * Endpoints típicos (v2):
 *   GET  {base}/gateway/products/2.0  -> catálogo con descripciones
 *   GET  {base}/gateway/printdata/1.0 -> técnicas/áreas de marcaje
 *   GET  {base}/gateway/pricelist/2.0 -> precios escalados
 *   GET  {base}/gateway/stock/2.0     -> stock
 *
 * Auth: header "x-Gateway-APIKey: <MIDOCEAN_API_KEY>".
 *
 * F1 plan: ingesta nocturna de productos+precios; stock cada 30 min;
 * datos de marcaje semanal (cambian poco).
 */

const BASE = process.env.MIDOCEAN_API_BASE || "https://api.midocean.com";
const API_KEY = process.env.MIDOCEAN_API_KEY || "";

function headers() {
  return {
    "x-Gateway-APIKey": API_KEY,
    Accept: "application/json",
  } as const;
}

export const midoceanAdapter: SupplierAdapter = {
  code: "midocean",
  name: "MidOcean",

  async ping() {
    if (!API_KEY) return { ok: false, reason: "MIDOCEAN_API_KEY no configurada" };
    try {
      const res = await fetch(`${BASE}/gateway/products/2.0?language=es`, {
        headers: headers(),
        // HEAD-like: solo queremos estado
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "fetch error" };
    }
  },

  async *fetchAllProducts(): AsyncIterable<Product> {
    if (!API_KEY) throw new Error("MIDOCEAN_API_KEY no configurada");
    // TODO F1: implementar paginación, fusionar products + pricelist + stock + printdata
    // Documentar en types.ts cómo viene cada feed y normalizar.
    return;
  },

  async fetchProduct(supplierRef: string): Promise<Product | null> {
    void supplierRef;
    // TODO F1
    return null;
  },

  async fetchStock(skus: string[]): Promise<Record<string, StockLevel>> {
    void skus;
    // TODO F1
    return {};
  },
};

/** Sync placeholder — el cron real lo invocará en F1 */
export async function syncMidocean(): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  return {
    supplier: "midocean",
    startedAt,
    finishedAt: new Date().toISOString(),
    productsFetched: 0,
    productsUpserted: 0,
    productsSkipped: 0,
    errors: [{ ref: "_", message: "Adapter aún no implementado (F1)" }],
  };
}
