/**
 * Cliente API Cifra (cifra.es / api.cifrashop.com).
 *
 * Auth: token UUID en path (`/products/<TOKEN>`). Sin headers especiales.
 * Token vive en env `CIFRA_API_TOKEN` (rotable desde cifra.es).
 *
 * Estructura datos: cada producto tiene `model` (referencia con variante de
 * color, ej. "A-012-AM") y `rootmodel` (referencia raíz, ej. "A-012").
 * Mapeo a nuestro modelo:
 *   - Product.supplierRef    = rootmodel
 *   - ProductVariant.sku     = model
 *
 * Precios: dos fuentes
 *   - /products devuelve `price_pvp` (precio venta público) en EUR string 4 dec
 *   - /prices devuelve `p_disc[]` con tramos por cantidad → PriceTier
 *
 * Imágenes: URL absoluta en publicatalogue.com. SE PROXEAN bajo /api/m/<hash>
 * via ensureMediaAsset — regla anti-supplier-leak: el cliente NUNCA debe ver
 * un dominio que delate el proveedor. publicatalogue.com es identificable.
 */

import { measuredJson } from "./blocking-timer";
import { resolveCredentialField } from "@/lib/supplier-credentials";
import {
  extractCifraColorSuffix,
  resolveCifraColor,
} from "./cifra-variant";

const BASE_URL = process.env.CIFRA_API_BASE || "https://api.cifrashop.com";
const DEFAULT_LANG = process.env.CIFRA_LANG || "es";

/**
 * Token: BD (SupplierCredential, Fase C módulo Proveedores) si está
 * configurado desde /admin/suppliers, si no `process.env.CIFRA_API_TOKEN`
 * de siempre. Async porque la BD es async — todo caller pasa a `await`
 * esto antes de construir la URL.
 */
async function resolveToken(): Promise<string> {
  return resolveCredentialField("cifra", "token", process.env.CIFRA_API_TOKEN || "");
}

export type CifraProduct = {
  model: string;          // ej. "A-012-AM" (con sufijo variante)
  rootmodel: string;      // ej. "A-012" (raíz, sin variante)
  name: string;
  description: string;
  category: string;
  image: string;
  quantity: number;       // stock disponible
  price_pvp: string;      // EUR string, 4 decimales (ej. "0.0250")
  length: string;         // cm string
  width: string;
  height: string;
  unacaja: number;        // uds por caja
  unpale: number;         // uds por palet
  pbcaja: string;         // peso bruto caja (kg)
  pncaja: string;         // peso neto caja
  dcaja: string;          // "41,0 x 19,5 x 37,0" (cm con coma)
  material: string;
  tgrabacion: string;     // técnica grabación (códigos: "A", "A, DIGITAL")
  mgrabacion: string;     // medida grabación "40x6 mm"
  fecha1: string;         // próxima entrada stock "0000-00-00" o fecha
  cantidad1: string;      // cantidad próxima entrada
};

export type CifraPriceTier = {
  model: string;
  rootmodel: string;
  p_disc: Array<{
    quantity: number;
    price: string;        // EUR string 4 dec, precio escalonado
  }>;
};

export type CifraOrderPayload = {
  commit?: boolean;                // false = validar, true = crear de verdad
  client_reference?: string;
  comment?: string;
  shipping_address: {
    firstname: string;
    lastname?: string;
    address_1: string;
    address_2?: string;
    city: string;
    zone: string;                  // provincia
    postcode: string;
    country: string;               // "ES"
    email?: string;
    telephone?: string;
  };
  items: Array<{ model: string; quantity: number }>;
};

export type CifraOrderResponse = {
  message: string;
  data: {
    order_id: number;
    shipping_address: CifraOrderPayload["shipping_address"];
    shipping_method: string;
    products: Array<{
      model: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }>;
    total: number;
    date_added: string;
  };
};

async function call<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Cifra ${r.status} ${r.statusText} en ${path}: ${body.slice(0, 200)}`);
  }
  // El catálogo completo (2.513 productos) se convierte de forma síncrona y
  // retiene el bucle de eventos mientras dura. Solo se mide. La etiqueta lleva
  // el endpoint sin el token, que va en el path y no debe acabar en un log.
  return measuredJson<T>(`cifra · parse JSON ${path.split("/")[1] ?? "?"}`, r);
}

async function callPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Cifra POST ${r.status} en ${path}: ${text.slice(0, 300)}`);
  }
  // Respuesta pequeña: no llegará al umbral y no escribirá nada. Se mide igual
  // para que la regla del guard sea simple —en un cliente de catálogo, TODO
  // `.json()` va medido— y nadie tenga que juzgar cuál merece cronómetro.
  return measuredJson<T>(`cifra · parse JSON POST ${path.split("/")[1] ?? "?"}`, r);
}

/** Lista completa de productos a PVP. */
export async function fetchProducts(lang: string = DEFAULT_LANG): Promise<CifraProduct[]> {
  const token = await resolveToken();
  if (!token) throw new Error("CIFRA_API_TOKEN no configurado (ni en .env ni en /admin/suppliers)");
  return call<CifraProduct[]>(`/products/${token}/${lang}`);
}

/**
 * Ping ligero: hace GET al endpoint de productos pero sólo lee headers/
 * primeros bytes para validar credenciales sin descargar el catálogo
 * completo (~MB). Si la BD no acepta cancelaciones tempranas, este
 * ping cargará el listado entero — es coste asumible para diagnóstico.
 */
export async function ping(): Promise<
  { ok: true; itemsSampled: number } | { ok: false; reason: string }
> {
  const token = await resolveToken();
  if (!token) return { ok: false, reason: "CIFRA_API_TOKEN no configurado (ni en .env ni en /admin/suppliers)" };
  try {
    const res = await fetch(`${BASE_URL}/products/${token}/${DEFAULT_LANG}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status} ${res.statusText}` };
    }
    // Sólo necesitamos que el token sea válido — abortamos antes de parsear todo
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return { ok: true, itemsSampled: data.length };
      }
      return { ok: false, reason: "Respuesta no es array de productos" };
    } catch {
      return {
        ok: false,
        reason: `Respuesta no JSON: ${text.slice(0, 100)}`,
      };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch error" };
  }
}

/**
 * Diagnostic: devuelve sample de N productos con todos los campos
 * relevantes para detectar problemas (stock = 0, precio = 0, formato
 * inesperado). Usado por /admin/suppliers/cifra para confirmar bugs.
 */
export async function diagnoseProducts(sampleSize = 5): Promise<{
  ok: boolean;
  totalCount: number;
  withStock: number;
  withZeroStock: number;
  withPrice: number;
  sample: CifraProduct[];
  message?: string;
}> {
  const token = await resolveToken();
  if (!token) {
    return {
      ok: false,
      totalCount: 0,
      withStock: 0,
      withZeroStock: 0,
      withPrice: 0,
      sample: [],
      message: "CIFRA_API_TOKEN no configurado (ni en .env ni en /admin/suppliers)",
    };
  }
  try {
    const all = await fetchProducts();
    const withStock = all.filter((p) => p.quantity > 0).length;
    const withZeroStock = all.filter((p) => p.quantity === 0).length;
    const withPrice = all.filter(
      (p) => p.price_pvp && parseFloat(p.price_pvp) > 0,
    ).length;
    return {
      ok: true,
      totalCount: all.length,
      withStock,
      withZeroStock,
      withPrice,
      sample: all.slice(0, sampleSize),
    };
  } catch (e) {
    return {
      ok: false,
      totalCount: 0,
      withStock: 0,
      withZeroStock: 0,
      withPrice: 0,
      sample: [],
      message: e instanceof Error ? e.message : "error",
    };
  }
}

/** Precios escalonados por cantidad (pricelist distribuidor). */
export async function fetchPriceTiers(): Promise<CifraPriceTier[]> {
  const token = await resolveToken();
  if (!token) throw new Error("CIFRA_API_TOKEN no configurado (ni en .env ni en /admin/suppliers)");
  return call<CifraPriceTier[]>(`/prices/${token}`);
}

/** Crear pedido. Pass `commit: false` para validar sin crear. */
export async function createOrder(payload: CifraOrderPayload): Promise<CifraOrderResponse> {
  const token = await resolveToken();
  if (!token) throw new Error("CIFRA_API_TOKEN no configurado (ni en .env ni en /admin/suppliers)");
  return callPost<CifraOrderResponse>(`/order/${token}/create`, {
    commit: payload.commit ?? false,
    ...payload,
  });
}

/** Detalle de un pedido ya creado. */
export function getOrder(orderId: number): Promise<unknown> {
  return call(`/order/${orderId}`);
}

/** Descargar URLs de documentos del pedido (factura/albarán). */
export function getOrderDocuments(
  orderId: number,
  type: "invoice" | "delivery_note" = "invoice",
): Promise<unknown> {
  return call(`/order/${orderId}/documents?type=${type}`);
}

// ─── Helpers de parsing ──────────────────────────────────────────────────

/** "0.0550" → 6 (céntimos redondeados). */
export function priceStringToCents(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** "17.50" cm → 175 mm. Devuelve null si "0.00" o no numérico. */
export function cmStringToMm(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10);
}

/** Extrae sufijo de color del model ("A-012-AM" → "AM"). */
export function extractColorSuffix(model: string, rootmodel: string): string | null {
  return extractCifraColorSuffix(model, rootmodel);
}

export function resolveColor(suffix: string | null): {
  name: string | null;
  hex: string | null;
  group: string | null;
} {
  return resolveCifraColor(suffix);
}
