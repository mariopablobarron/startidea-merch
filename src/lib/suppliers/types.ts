/**
 * Tipos unificados para todos los proveedores (MidOcean, Makito, futuros).
 * Cada adapter normaliza su feed/API a este shape.
 */

export type Money = {
  amount: number;
  currency: "EUR";
};

export type SupplierCode = "midocean" | "makito";

export type PriceTier = {
  minQty: number;
  unitPrice: Money;
};

export type StockLevel = {
  quantity: number;
  /** Fecha estimada de reposición si quantity = 0 */
  restockEta?: string;
};

export type ProductImage = {
  url: string;
  alt?: string;
  /** Si es la imagen principal del producto/variante */
  primary?: boolean;
};

export type MarkingTechnique = {
  code: string;            // "screen_print" | "embroidery" | "laser" | "dtf" | "pad_print" | ...
  label: string;           // legible
  maxColors?: number;
  setupFee?: Money;
};

export type MarkingArea = {
  code: string;            // "front", "back", "left_chest", ...
  label: string;
  maxWidthMm?: number;
  maxHeightMm?: number;
  techniques: string[];    // codes referenciando MarkingTechnique
};

export type ProductVariant = {
  sku: string;
  /** SKU original del proveedor antes de normalizar */
  supplierSku: string;
  color?: string;
  colorHex?: string;
  size?: string;
  ean?: string;
  stock?: StockLevel;
  prices: PriceTier[];     // ordenadas asc por minQty
  images: ProductImage[];
};

export type Product = {
  /** ID interno tras normalizar (ej. "midocean:MO9036") */
  id: string;
  supplier: SupplierCode;
  supplierRef: string;     // referencia original del proveedor
  name: string;
  description: string;
  category: string;        // categoría normalizada interna
  supplierCategory?: string;
  brand?: string;
  tags: string[];
  ecoLabels: string[];     // ["GOTS", "OEKO-TEX", "RPET", ...]
  weightGrams?: number;
  dimensionsMm?: { w: number; h: number; d: number };
  primaryImage?: ProductImage;
  variants: ProductVariant[];
  markingAreas: MarkingArea[];
  markingTechniques: MarkingTechnique[];
  /** Precio mínimo cualquier variante × cualquier tier — para "Desde X €" */
  fromPrice?: Money;
  url?: string;            // URL pública del proveedor (referencia interna)
  updatedAt: string;       // ISO
};

export type SyncResult = {
  supplier: SupplierCode;
  startedAt: string;
  finishedAt: string;
  productsFetched: number;
  productsUpserted: number;
  productsSkipped: number;
  errors: Array<{ ref: string; message: string }>;
};

export interface SupplierAdapter {
  readonly code: SupplierCode;
  readonly name: string;

  /** Comprueba que las credenciales y endpoint están bien configurados */
  ping(): Promise<{ ok: true } | { ok: false; reason: string }>;

  /** Listado completo (para sync periódico). Implementación puede paginar internamente. */
  fetchAllProducts(): AsyncIterable<Product>;

  /** Fetch puntual de un producto (revalidación pre-pedido). */
  fetchProduct(supplierRef: string): Promise<Product | null>;

  /** Stock en tiempo real para validación pre-checkout (puede ser feed nocturno en algunos proveedores). */
  fetchStock(skus: string[]): Promise<Record<string, StockLevel>>;
}
