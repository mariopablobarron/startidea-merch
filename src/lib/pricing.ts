/**
 * Pricing — escalado por cantidad para fichas de producto.
 *
 * Hasta que MidOcean pricelist esté disponible (24h tras primer call) y/o
 * Makito conectado, usamos defaults internos por rango de "fromPriceCents".
 * El componente cliente recibe los tramos y muestra el escalado tipo
 * Garrampa: 10/25/50/100/250 con marcadores POPULAR / MÁS ECONÓMICO.
 */

export type PriceTier = {
  minQty: number;
  unitPriceCents: number;
  badge?: "POPULAR" | "MAS_ECONOMICO";
  source: "PROVIDER" | "ESTIMATE";
};

export type Money = {
  cents: number;
  formatted: string; // e.g. "1,30 €"
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(cents: number): Money {
  return { cents, formatted: EUR.format(cents / 100) };
}

/**
 * Genera tramos por defecto a partir de una estimación de precio base.
 * Curva típica del sector merch B2B: 10 uds = 100% del base, 250 uds ≈ 35–45%.
 */
export function defaultTiersFromBase(baseCents: number): PriceTier[] {
  if (!baseCents || baseCents <= 0) return [];
  const curve = [
    { minQty: 10, mult: 1.0 },
    { minQty: 25, mult: 0.78, badge: "POPULAR" as const },
    { minQty: 50, mult: 0.62 },
    { minQty: 100, mult: 0.45 },
    { minQty: 250, mult: 0.32, badge: "MAS_ECONOMICO" as const },
  ];
  return curve.map((c) => ({
    minQty: c.minQty,
    unitPriceCents: Math.round(baseCents * c.mult),
    badge: c.badge,
    source: "ESTIMATE",
  }));
}

/**
 * Estima un precio base a partir de la categoría / tipo de producto.
 * Es un placeholder hasta tener pricelist real.
 */
export function estimateBaseCentsFromName(name: string, category?: string | null): number {
  const t = `${name} ${category || ""}`.toLowerCase();
  // Heurística rápida — orden importa (más específico primero)
  if (/bol[íi]grafo|pen|writing/.test(t)) return 80;          // 0,80 €
  if (/llavero|keyring/.test(t)) return 120;                  // 1,20 €
  if (/lanyard|cord/.test(t)) return 110;
  if (/tote\s*bag|bolsa\s+algod[óo]n/.test(t)) return 180;
  if (/libreta|cuaderno|notebook/.test(t)) return 350;
  if (/taza|mug/.test(t)) return 320;
  if (/botella|bottle|drinkware/.test(t)) return 480;
  if (/mochila|backpack/.test(t)) return 1450;
  if (/camiseta|t-?shirt/.test(t)) return 380;
  if (/polo/.test(t)) return 990;
  if (/sudadera|hoodie|sweat/.test(t)) return 1850;
  if (/toalla|towel/.test(t)) return 580;
  if (/power\s*bank|cargador/.test(t)) return 1290;
  if (/usb|memoria/.test(t)) return 540;
  if (/auricular|altavoz|speaker/.test(t)) return 1890;
  if (/paraguas|umbrella/.test(t)) return 890;
  if (/gorra|cap/.test(t)) return 480;
  return 350; // fallback genérico ~3,50 €
}

export function pickTier(tiers: PriceTier[], qty: number): PriceTier | undefined {
  if (!tiers.length) return;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0];
  for (const t of sorted) if (qty >= t.minQty) chosen = t;
  return chosen;
}

export function totalForQty(tiers: PriceTier[], qty: number): Money | null {
  const t = pickTier(tiers, qty);
  if (!t) return null;
  return formatMoney(t.unitPriceCents * qty);
}

// ─── Margen comercial ─────────────────────────────────────────────────────────

/**
 * Multiplicador del margen comercial coste→cliente. Configurable vía env
 * MARGIN_MULTIPLIER (default 1,6667 = 40% de beneficio sobre venta).
 *
 * OJO — markup y margen NO son lo mismo, y el default lo dice en markup:
 *   multiplicador 1,6667  →  +66,67% sobre COSTE  →  40,0% sobre VENTA
 *   multiplicador 1,6     →  +60%    sobre COSTE  →  37,5% sobre VENTA
 * El objetivo comercial se fija SIEMPRE sobre venta ("40% de beneficio"), así
 * que la conversión es multiplicador = 1 / (1 − objetivo). Hasta el 17-ago-2026
 * el default era 1,6 y todo el catálogo salía al 37,5%: 2,5 puntos por debajo
 * del objetivo en 9.532 productos (auditoría contra la BD de producción).
 *
 * FUENTE ÚNICA del margen para todo el sitio: tiers públicos, precio "desde",
 * total del carrito y la ruta /api/quote/calculate (producto y marcaje). Si
 * cada superficie aplicara su propio margen, el mismo producto mostraría
 * precios distintos (era el caso: la web pública mostraba el coste NETO sin
 * margen y solo el path "con marcaje" aplicaba el multiplicador).
 *
 * No cubre portes ni la comisión de Stripe (1,5% + 0,25 €/pedido): son de
 * PEDIDO, no de producto, y se cotizan aparte. Para que el 40% quedara limpio
 * tras Stripe el multiplicador tendría que ser ~1,71.
 */
export function marginMultiplier(override?: number): number {
  const m = override ?? Number(process.env.MARGIN_MULTIPLIER ?? "1.6667");
  return Number.isFinite(m) && m > 0 ? m : 1.6667;
}

/** Aplica el margen comercial a un coste neto → precio cliente (céntimos). */
export function applyMargin(costCents: number, override?: number): number {
  return Math.round(costCents * marginMultiplier(override));
}

/**
 * Total de una LÍNEA de pedido tras aplicar un descuento FIXED a nivel de
 * PEDIDO (una sola vez, no por unidad). Los descuentos PERCENT van ya horneados
 * en el precio unitario de cada tier (son invariantes a la cantidad); los FIXED
 * se aplican aquí, sobre el subtotal, para no multiplicarse por las unidades.
 *
 *   subtotal = unitPriceCents(post-PERCENT) × qty
 *   total    = max(0, subtotal − fixedValue)
 */
export function orderTotalCents(
  lineSubtotalCents: number,
  orderFixedPromo: { value: number } | null | undefined,
): number {
  if (!orderFixedPromo) return lineSubtotalCents;
  return Math.max(0, lineSubtotalCents - Math.max(0, orderFixedPromo.value));
}
