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
