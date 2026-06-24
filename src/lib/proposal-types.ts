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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

/**
 * Convierte una cotización (computeCotizacion) en UNA línea de propuesta
 * todo-incluido (producto+marcaje+portes ya en el total, coherente con "envío
 * incluido"). El cliente NUNCA ve proveedor/coste: usa publicRef (STM-XXX),
 * NUNCA supplierRef. Función pura — fácil de testear.
 */
export function cotizacionToProposalItem(quote: CotizarOk): ProposalQuoteItem {
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
    markingPerUnitCents: 0,
    markingSetupCents: 0,
    totalCents: quote.pvp.baseTotal,
    priceSource: quote.product.hasRealPricing ? "tier" : "estimate",
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

export function formatSizes(sizes: Record<string, number> | null | undefined): string {
  if (!sizes) return "—";
  const entries = Object.entries(sizes).filter(([, n]) => n > 0);
  if (!entries.length) return "—";
  return entries.map(([s, n]) => `${n}×${s.toUpperCase()}`).join(", ");
}
