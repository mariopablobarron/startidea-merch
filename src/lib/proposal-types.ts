import type { CotizarOk } from "./cotizar-core";

/**
 * Tipos compartidos para Proposal — usados desde el endpoint API,
 * el componente Recommender, el PDF y el admin.
 *
 * Mantenidos en sync con QuoteItem de Recommender.tsx y el shape
 * persistido en RecommenderQuery.quoteItems.
 */

export type ProposalQuoteItem = {
  description: string;
  notFound: boolean;
  searchedAs?: string;
  quantity: number;
  sizes?: Record<string, number> | null;
  technique: string | null;
  colorRequested: string | null;
  rationale?: string;
  product: {
    slug: string;
    name: string;
    ref: string;
    url: string;
    primaryImageUrl: string | null;
  } | null;
  unitPriceCents: number | null;
  markingPerUnitCents: number;
  markingSetupCents: number;
  totalCents: number | null;
  priceSource: "tier" | "estimate" | null;
  /**
   * true si el concepto y/o el precio de esta línea vienen editados a mano
   * desde /admin/cotizar (excepción comercial) en vez de calculados. Cuando
   * es true, `breakdown` se omite — el precio editado ya no cuadra con el
   * desglose producto/marcaje/cliché/envío calculado, así que el PDF
   * renderiza la línea única en vez de un desglose que mentiría.
   */
  manualOverride?: boolean;
  /**
   * Desglose PVP para el PDF (petición Mario 2026-08-11): el cliente ve
   * SIEMPRE producto / marcaje / cliché / envío como líneas separadas, con
   * 0,00 € cuando el concepto no aplica. Opcional: propuestas antiguas
   * persistidas sin breakdown siguen renderizando la línea todo-incluido.
   * Todos los importes son PVP (margen aplicado), nunca coste.
   */
  breakdown?: {
    productUnitCents: number;
    productTotalCents: number;
    markingUnitCents: number;
    markingTotalCents: number;
    /** Cliché / fotolito / pantalla (setup fijo del pedido). */
    setupCents: number;
    shippingCents: number;
    discountCents: number;
  };
};

export const IVA_RATE = 0.21;

export type ProposalTotals = {
  subtotalCents: number;
  ivaCents: number;
  totalCents: number;
};

/**
 * Suma los totalCents de los items (ignora notFound) y aplica IVA 21%.
 * Redondeo a céntimo (Math.round) para evitar drift de 1 cent al sumar.
 */
export function computeProposalTotals(items: ProposalQuoteItem[]): ProposalTotals {
  const subtotalCents = items.reduce(
    (sum, it) => sum + (it.notFound ? 0 : it.totalCents ?? 0),
    0,
  );
  const ivaCents = Math.round(subtotalCents * IVA_RATE);
  const totalCents = subtotalCents + ivaCents;
  return { subtotalCents, ivaCents, totalCents };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

/**
 * Convierte una cotización (computeCotizacion) en UNA línea de propuesta
 * todo-incluido (producto+marcaje+portes ya en el total, coherente con "envío
 * incluido"). El cliente NUNCA ve proveedor/coste: usa publicRef (STM-XXX),
 * NUNCA supplierRef. Función pura — fácil de testear.
 */
export function cotizacionToProposalItem(quote: CotizarOk): ProposalQuoteItem {
  // Desglose PVP: el cliché (setup) se separa del marcaje variable repartiendo
  // el PVP de marcaje en la misma proporción que el coste neto (setup/total).
  const marcajePvp = quote.pvp.marcajeTotal;
  const netMarking = quote.marking?.totalMarkingCents ?? 0;
  const netSetup = quote.marking?.setupCents ?? 0;
  const setupPvp =
    netMarking > 0 && netSetup > 0 ? Math.round((marcajePvp * netSetup) / netMarking) : 0;
  const markingRestPvp = Math.max(0, marcajePvp - setupPvp);
  const breakdown: NonNullable<ProposalQuoteItem["breakdown"]> = {
    productUnitCents: Math.round(quote.pvp.productoTotal / quote.qty),
    productTotalCents: quote.pvp.productoTotal,
    markingUnitCents: Math.round(markingRestPvp / quote.qty),
    markingTotalCents: markingRestPvp,
    setupCents: setupPvp,
    // Envío gratis: el descuento de cotizar-core ES el envío (baseTotal =
    // producto+marcaje). Aquí se muestra envío 0,00 € y se descuenta esa
    // parte del descuento para que las filas sumen exactamente totalCents.
    shippingCents: quote.envioGratis ? 0 : quote.pvp.envioTotal,
    discountCents: quote.envioGratis
      ? Math.max(0, quote.pvp.descuentoCents - quote.pvp.envioTotal)
      : quote.pvp.descuentoCents,
  };

  return {
    description: quote.product.name,
    notFound: false,
    quantity: quote.qty,
    sizes: null,
    technique: quote.marking?.techniqueLabel ?? null,
    colorRequested: null,
    product: {
      slug: quote.product.slug,
      name: quote.product.name,
      ref: quote.product.publicRef, // STM-XXX / slug — NUNCA supplierRef
      url: `${SITE_URL}/catalogo/${quote.product.slug}`,
      primaryImageUrl: quote.product.imageUrl,
    },
    unitPriceCents: Math.round(quote.pvp.baseTotal / quote.qty),
    markingPerUnitCents: breakdown.markingUnitCents,
    markingSetupCents: breakdown.setupCents,
    totalCents: quote.pvp.baseTotal,
    priceSource: quote.product.hasRealPricing ? "tier" : "estimate",
    breakdown,
  };
}

export const TECHNIQUE_LABEL: Record<string, string> = {
  serigrafia: "Serigrafía",
  bordado: "Bordado",
  laser: "Láser",
  dtf: "DTF",
  tampografia: "Tampografía",
};

export function formatTechnique(t: string | null | undefined): string {
  if (!t) return "—";
  return TECHNIQUE_LABEL[t] ?? t;
}

/**
 * Texto de la primera columna de la línea en el PDF del cliente.
 *
 * El caso que obliga a que esto sea una función y no un `??` suelto: cuando
 * el comercial edita el concepto en /admin/cotizar (`manualOverride`), el
 * objeto `product` sigue ahí intacto — solo cambia `description`. Un
 * `it.product?.name ?? it.description` imprime entonces el nombre de catálogo
 * y **tira lo tecleado**, que es justo lo que la etiqueta del campo promete
 * que el cliente verá ("Concepto (lo que ve el cliente)").
 *
 * Con `manualOverride` manda `description`; sin él, el nombre de catálogo,
 * que es más fiable que la descripción libre de propuestas antiguas.
 */
export function proposalLineLabel(item: ProposalQuoteItem): string {
  if (item.manualOverride) return item.description;
  return item.product?.name ?? item.description;
}

export function formatSizes(sizes: Record<string, number> | null | undefined): string {
  if (!sizes) return "—";
  const entries = Object.entries(sizes).filter(([, n]) => n > 0);
  if (!entries.length) return "—";
  return entries.map(([s, n]) => `${n}×${s.toUpperCase()}`).join(", ");
}
