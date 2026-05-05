/**
 * Cliente para los endpoints de órdenes y pruebas de MidOcean:
 *   - /gateway/order/2.1     create / detail
 *   - /gateway/proof/1.0     approve / reject / addartwork
 *
 * IMPORTANTE — guarda contra envíos accidentales a producción:
 *   El método createOrder() solo ejecuta el POST real cuando
 *   MIDOCEAN_LIVE_ORDERS=true. Por defecto retorna el payload sin
 *   enviarlo, marcado como dryRun:true. Esto permite probar el flujo
 *   admin sin disparar pedidos reales (que cuestan dinero).
 */

const BASE = process.env.MIDOCEAN_API_BASE || "https://api.midocean.com";
const API_KEY = process.env.MIDOCEAN_API_KEY || "";
const LIVE = process.env.MIDOCEAN_LIVE_ORDERS === "true";
const CUSTOMER_NUMBER = process.env.MIDOCEAN_CUSTOMER_NUMBER; // p.ej. "80869510"

function headers(): Record<string, string> {
  return {
    "x-Gateway-APIKey": API_KEY,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export type MidoceanOrderItem = {
  master_code: string; // ref producto (master_code) — NO el variant SKU
  sku: string;          // sku exacto de la variant
  quantity: number;
  print_positions?: Array<{
    position_id: string;
    print_size_height?: number;
    print_size_width?: number;
    printing_technique: string;
    number_of_print_colors?: number;
    print_artwork_url?: string;        // URL del archivo a imprimir
  }>;
};

export type MidoceanCreateOrderPayload = {
  shipping_address: {
    company_name: string;
    contact_name: string;
    street1: string;
    postal_code: string;
    city: string;
    country: string; // ISO-2 (ES, FR, DE…)
    email: string;
    phone?: string;
    vat_number?: string;
  };
  customer_order_reference: string;
  remarks?: string;
  items: MidoceanOrderItem[];
};

export type MidoceanCreateOrderResult =
  | { dryRun: true; payload: MidoceanCreateOrderPayload; reason: string }
  | { dryRun: false; ok: true; orderId: string; raw: unknown }
  | { dryRun: false; ok: false; status: number; error: string };

export const midoceanOrders = {
  /** Crea un pedido en MidOcean. Por defecto dry-run. */
  async createOrder(payload: MidoceanCreateOrderPayload): Promise<MidoceanCreateOrderResult> {
    if (!API_KEY) {
      return { dryRun: true, payload, reason: "MIDOCEAN_API_KEY no configurada" };
    }
    if (!LIVE) {
      return {
        dryRun: true,
        payload,
        reason: "MIDOCEAN_LIVE_ORDERS != true (modo simulación)",
      };
    }
    const res = await fetch(`${BASE}/gateway/order/2.1?method=create`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      return { dryRun: false, ok: false, status: res.status, error: text.slice(0, 500) };
    }
    const orderId = extractOrderId(json) || "";
    return { dryRun: false, ok: true, orderId, raw: json };
  },

  /** Consulta el detalle/tracking de un pedido. */
  async getOrderDetail(orderId: string): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
    if (!API_KEY) return { ok: false, status: 0, error: "MIDOCEAN_API_KEY no configurada" };
    const url = `${BASE}/gateway/order/2.1?method=detail&order_id=${encodeURIComponent(orderId)}${
      CUSTOMER_NUMBER ? `&customer_number=${CUSTOMER_NUMBER}` : ""
    }`;
    const res = await fetch(url, { headers: headers(), cache: "no-store", redirect: "follow" });
    if (!res.ok) {
      return { ok: false, status: res.status, error: (await res.text().catch(() => "")).slice(0, 500) };
    }
    return { ok: true, status: res.status, data: await res.json() };
  },
};

function extractOrderId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return;
  const r = raw as Record<string, unknown>;
  if (typeof r.order_id === "string") return r.order_id;
  if (typeof r.orderId === "string") return r.orderId;
  if (r.ORDER_RESPONSE && typeof (r.ORDER_RESPONSE as Record<string, unknown>).ORDER_ID === "string") {
    return (r.ORDER_RESPONSE as Record<string, string>).ORDER_ID;
  }
  return undefined;
}

export const midoceanProofs = {
  async approve(proofId: string): Promise<{ ok: boolean; status: number; raw?: unknown; error?: string }> {
    if (!API_KEY) return { ok: false, status: 0, error: "MIDOCEAN_API_KEY no configurada" };
    if (!LIVE) {
      return { ok: true, status: 0, raw: { dryRun: true, action: "approve", proofId } };
    }
    const res = await fetch(`${BASE}/gateway/proof/1.0?method=approve`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ proof_id: proofId }),
    });
    const text = await res.text();
    return res.ok
      ? { ok: true, status: res.status, raw: safeJson(text) }
      : { ok: false, status: res.status, error: text.slice(0, 500) };
  },

  async reject(proofId: string, reason: string): Promise<{ ok: boolean; status: number; raw?: unknown; error?: string }> {
    if (!API_KEY) return { ok: false, status: 0, error: "MIDOCEAN_API_KEY no configurada" };
    if (!LIVE) {
      return { ok: true, status: 0, raw: { dryRun: true, action: "reject", proofId, reason } };
    }
    const res = await fetch(`${BASE}/gateway/proof/1.0?method=reject`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ proof_id: proofId, reason }),
    });
    const text = await res.text();
    return res.ok
      ? { ok: true, status: res.status, raw: safeJson(text) }
      : { ok: false, status: res.status, error: text.slice(0, 500) };
  },

  async addArtwork(proofId: string, artworkUrl: string): Promise<{ ok: boolean; status: number; raw?: unknown; error?: string }> {
    if (!API_KEY) return { ok: false, status: 0, error: "MIDOCEAN_API_KEY no configurada" };
    if (!LIVE) {
      return { ok: true, status: 0, raw: { dryRun: true, action: "addArtwork", proofId, artworkUrl } };
    }
    const res = await fetch(`${BASE}/gateway/proof/1.0?method=addartwork`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ proof_id: proofId, artwork_url: artworkUrl }),
    });
    const text = await res.text();
    return res.ok
      ? { ok: true, status: res.status, raw: safeJson(text) }
      : { ok: false, status: res.status, error: text.slice(0, 500) };
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
