/**
 * MidOcean — Customer API.
 * Docs: https://midoceanbrands.atlassian.net/wiki/spaces/AIG/overview
 *
 * Endpoints:
 *   GET /gateway/products/2.0?language=es  → catálogo (~25 MB JSON)
 *   GET /gateway/pricelist/2.0             → precios escalados (genera el primer
 *                                            día y queda disponible 24 h después)
 *   GET /gateway/stock/2.0                 → mapa sku → qty (~1 MB JSON)
 *   GET /gateway/printdata/1.0             → posiciones y técnicas de marcaje
 *
 * Auth: header `x-Gateway-APIKey: <MIDOCEAN_API_KEY>`. La API redirige (303)
 * a un S3 firmado, así que `redirect: 'follow'` es obligatorio.
 */

const BASE = process.env.MIDOCEAN_API_BASE || "https://api.midocean.com";
const API_KEY = process.env.MIDOCEAN_API_KEY || "";

function headers() {
  return {
    "x-Gateway-APIKey": API_KEY,
    Accept: "application/json",
  } as const;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`MidOcean ${path} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ============================================================================
// Tipos del feed MidOcean (subset relevante)
// ============================================================================

export type MidoceanRawAsset = {
  url: string;
  url_highress?: string;
  type: string;
  subtype?: string;
};

export type MidoceanRawVariant = {
  variant_id: string;
  sku: string;
  release_date?: string;
  discontinued_date?: string;
  category_level1?: string;
  category_level2?: string;
  category_level3?: string;
  color_description?: string;
  color_group?: string;
  color_code?: string;
  pms_color?: string;
  gtin?: string;
  plc_status?: string;
  plc_status_description?: string;
  digital_assets?: MidoceanRawAsset[];
};

export type MidoceanRawProduct = {
  master_code: string;
  master_id: string;
  product_name: string;
  brand?: string;
  category_code?: string;
  category?: string;
  product_class?: string;
  short_description?: string;
  long_description?: string;
  material?: string;
  country_of_origin?: string;
  // dimensiones (vienen como strings con unidad separada)
  length?: string;
  length_unit?: string;
  width?: string;
  width_unit?: string;
  height?: string;
  height_unit?: string;
  gross_weight?: string;
  gross_weight_unit?: string;
  digital_assets?: MidoceanRawAsset[];
  variants: MidoceanRawVariant[];
};

export type MidoceanStockResponse = {
  modified_at: string;
  stock: Array<{ sku: string; qty: number }>;
};

export type MidoceanPrintDataResponse = {
  printing_technique_descriptions: Array<{
    id: string;
    name: Array<Record<string, string>>;
  }>;
  products: Array<MidoceanRawPrintProduct>;
};

export type MidoceanRawPrintProduct = {
  master_code: string;
  master_id: string;
  item_color_numbers?: string[];
  print_manipulation?: string;
  print_template?: string;
  printing_positions?: Array<{
    position_id: string;
    print_size_unit?: string;
    max_print_size_height?: number;
    max_print_size_width?: number;
    print_position_type?: string;
    rotation?: number;
    printing_techniques?: Array<{
      id: string;
      default?: boolean;
      max_colours?: string;
    }>;
    images?: Array<{
      print_position_image_blank?: string;
      print_position_image_with_area?: string;
      variant_color?: string;
    }>;
    category?: string;
  }>;
};

// ============================================================================
// Cliente
// ============================================================================

export const midoceanClient = {
  async ping(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!API_KEY) return { ok: false, reason: "MIDOCEAN_API_KEY no configurada" };
    try {
      const res = await fetch(`${BASE}/gateway/stock/2.0`, {
        headers: headers(),
        redirect: "follow",
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "fetch error" };
    }
  },

  async fetchProducts(language = "es"): Promise<MidoceanRawProduct[]> {
    if (!API_KEY) throw new Error("MIDOCEAN_API_KEY no configurada");
    return fetchJson<MidoceanRawProduct[]>(`/gateway/products/2.0?language=${language}`);
  },

  async fetchStock(): Promise<MidoceanStockResponse> {
    if (!API_KEY) throw new Error("MIDOCEAN_API_KEY no configurada");
    return fetchJson<MidoceanStockResponse>(`/gateway/stock/2.0`);
  },

  async fetchPrintData(language = "es"): Promise<MidoceanPrintDataResponse> {
    if (!API_KEY) throw new Error("MIDOCEAN_API_KEY no configurada");
    return fetchJson<MidoceanPrintDataResponse>(`/gateway/printdata/1.0?language=${language}`);
  },
};

// ============================================================================
// Helpers de normalización
// ============================================================================

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Filtra assets que son IMAGENES reales. MidOcean mete en `digital_assets` también
 * PDFs (declaration-of-conformity, manuals…), MP4 y otros. El campo `type` distingue.
 */
function imageAssets(assets?: MidoceanRawAsset[]): MidoceanRawAsset[] {
  if (!assets || !assets.length) return [];
  return assets.filter((a) => {
    if (!a.url) return false;
    if (a.type && a.type !== "image") return false;
    // Doble check por extensión por si el feed olvida el tipo
    return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(a.url);
  });
}

export function pickPrimaryImage(assets?: MidoceanRawAsset[]): string | undefined {
  const imgs = imageAssets(assets);
  if (!imgs.length) return;
  const front = imgs.find((a) => a.subtype === "item_picture_front");
  return (front || imgs[0]).url;
}

export function variantImages(assets?: MidoceanRawAsset[]): string[] {
  return imageAssets(assets).map((a) => a.url).slice(0, 8);
}

export function parseUnitToMm(value?: string, unit?: string): number | undefined {
  if (!value || !unit) return;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return;
  switch (unit.toLowerCase()) {
    case "mm":
      return Math.round(n);
    case "cm":
      return Math.round(n * 10);
    case "m":
      return Math.round(n * 1000);
    default:
      return Math.round(n);
  }
}

export function parseWeightToG(value?: string, unit?: string): number | undefined {
  if (!value || !unit) return;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return;
  switch (unit.toLowerCase()) {
    case "g":
      return Math.round(n);
    case "kg":
      return Math.round(n * 1000);
    default:
      return Math.round(n);
  }
}

export function spanishTechniqueName(
  desc: MidoceanPrintDataResponse["printing_technique_descriptions"][number],
): string {
  for (const block of desc.name) {
    if ("es" in block) return block.es;
    if ("en" in block) return block.en;
  }
  return desc.id;
}
