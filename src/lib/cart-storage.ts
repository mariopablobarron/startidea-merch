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

export function addItem(item: CartItem) {
  const items = readCart();
  // mismo producto + misma técnica + misma cantidad → reemplazar
  const idx = items.findIndex(
    (it) => it.productSlug === item.productSlug && it.markingTechniqueCode === item.markingTechniqueCode,
  );
  if (idx >= 0) items.splice(idx, 1);
  items.push(item);
  writeCart(items);
}

export function removeItem(productSlug: string, markingTechniqueCode?: string | null) {
  const items = readCart().filter(
    (it) =>
      !(it.productSlug === productSlug &&
        (markingTechniqueCode == null || it.markingTechniqueCode === markingTechniqueCode)),
  );
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
