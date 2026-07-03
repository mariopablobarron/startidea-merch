/**
 * Cesta de cotización con persistencia en localStorage.
 * Comparte formato con /api/cart-quote para que el cliente sólo
 * empuje los items al servidor cuando finalice.
 */

/**
 * Marca individual de un item (1..N por item).
 * Si el item tiene N marcas, los campos planos markingPositionId/TechniqueCode/
 * Colours son ESPEJO del primer elemento de `markings[]`. Mantenidos durante
 * la transición para no romper código viejo que lee el shape plano.
 */
export type CartItemMarking = {
  positionId: string;
  positionLabel?: string | null;
  techniqueCode: string;
  techniqueName?: string | null;
  numberOfColors: number;
  manipulationCode?: string | null;
  notes?: string | null;
};

export type CartItem = {
  productSlug: string;
  productRef: string;
  productName: string;
  primaryImageUrl?: string | null;
  quantity: number;
  variantSku?: string | null;
  colorName?: string | null;
  size?: string | null;
  // Shape plano (deprecated pero mantenido): primer marcaje
  markingTechniqueCode?: string | null;
  markingTechniqueName?: string | null;
  markingPositionId?: string | null;
  markingColours?: number | null;
  markingComplexity?: string | null;
  // Nuevo: array completo. Si vacío o ausente, no hay marcaje.
  // Si hay 1 elemento, debe coincidir con los campos planos.
  markings?: CartItemMarking[];
  unitPriceClientCents?: number | null;
  totalClientCents?: number | null;
  notes?: string | null;
  // Logo del cliente subido tras /api/uploads/customer-logo (preview + admin)
  customerLogoUrl?: string | null;
  customerLogoFilename?: string | null;
  customerLogoSize?: number | null;
};

const KEY = "merch:cart";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("merch:cart-change"));
  } catch {}
}

/**
 * Dos líneas del carrito son "la misma" si coinciden producto + técnica de
 * marcaje + VARIANTE (color/talla). Distinta variante ⇒ línea separada: así el
 * cliente puede pedir el mismo producto en varios colores o tallas.
 */
function sameLine(a: CartItem, b: CartItem): boolean {
  return (
    a.productSlug === b.productSlug &&
    (a.markingTechniqueCode ?? null) === (b.markingTechniqueCode ?? null) &&
    (a.variantSku ?? null) === (b.variantSku ?? null)
  );
}

export function addItem(item: CartItem) {
  const items = readCart();
  // mismo producto + técnica + variante → reemplazar (re-añadir actualiza qty)
  const idx = items.findIndex((it) => sameLine(it, item));
  if (idx >= 0) items.splice(idx, 1);
  items.push(item);
  writeCart(items);
}

/** Elimina la línea en la posición `index` del carrito. */
export function removeItemAt(index: number) {
  const items = readCart();
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  writeCart(items);
}

export function clearCart() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("merch:cart-change"));
  } catch {}
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + (it.totalClientCents || 0), 0);
}
