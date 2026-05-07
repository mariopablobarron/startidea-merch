import type { PriceTier } from "@/lib/pricing";

const EUR = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Tabla de precios escalonados estática — mostrar antes de la calculadora.
 * Reduce la fricción mental del visitante: ve el precio sin tener que
 * configurar nada (criterio garrampa.es: tabla siempre visible).
 *
 * Si `tiers` viene del pricelist real (PROVIDER) los usamos. Si no,
 * generamos tramos estimados a partir de `baseCents` con un decay típico
 * del sector (-10/-20/-30/-40/-50% según cantidad).
 *
 * Solo precio del producto base — el marcaje se suma con la calculadora.
 */
export function PriceTierTable({
  tiers,
  baseCentsForEstimate,
}: {
  tiers?: PriceTier[];
  baseCentsForEstimate?: number;
}) {
  const rows = buildRows(tiers, baseCentsForEstimate);
  if (rows.length === 0) return null;

  // Marcamos popular y mejor precio
  const popularIdx = pickPopularIndex(rows);
  const cheapestIdx = rows.length - 1; // ya van ordenadas asc por minQty → última = mejor precio/ud

  const isEstimate = !tiers || tiers.length === 0;

  return (
    <section
      aria-labelledby="price-tiers-title"
      className="mt-6 rounded-2xl border border-line bg-bone-soft p-4"
    >
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 id="price-tiers-title" className="text-xs font-medium uppercase tracking-wider text-ink/60">
          Precio por cantidad
        </h2>
        <p className="text-[10px] text-ink/40">
          {isEstimate ? "Estimación" : "Tarifa proveedor"} · Sin marcaje · IVA no incl.
        </p>
      </div>

      <ul className="space-y-1.5" role="list">
        {rows.map((r, i) => {
          const isPopular = i === popularIdx;
          const isCheapest = i === cheapestIdx;
          return (
            <li
              key={r.minQty}
              className={`flex items-baseline justify-between rounded-lg px-3 py-2 text-sm ${
                isPopular
                  ? "bg-accent/10 ring-1 ring-accent/30"
                  : isCheapest
                    ? "bg-social/10 ring-1 ring-social/20"
                    : "bg-bone"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-ink tabular-nums">{r.minQty} uds</span>
                {isPopular && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone">
                    Popular
                  </span>
                )}
                {isCheapest && (
                  <span className="rounded-full bg-social px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone">
                    Mejor precio
                  </span>
                )}
              </span>
              <span className="font-display text-base font-semibold tabular-nums text-ink">
                {EUR.format(r.unitPriceCents / 100)} <span className="text-xs font-normal text-ink/50">€/ud</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-ink/50">
        Configura más abajo cantidad exacta, técnica de marcaje y posición para tu cotización
        final en 24h.
      </p>
    </section>
  );
}

function buildRows(
  tiers: PriceTier[] | undefined,
  baseCents: number | undefined,
): Array<{ minQty: number; unitPriceCents: number }> {
  if (tiers && tiers.length > 0) {
    // Mostramos máximo 6 tramos representativos
    return tiers
      .slice()
      .sort((a, b) => a.minQty - b.minQty)
      .slice(0, 6)
      .map((t) => ({ minQty: t.minQty, unitPriceCents: t.unitPriceCents }));
  }
  if (!baseCents || baseCents <= 0) return [];
  // Estimación: decay típico del sector merchandising B2B
  const tramos: Array<[number, number]> = [
    [10, 1.0],
    [25, 0.85],
    [50, 0.75],
    [100, 0.65],
    [250, 0.55],
    [500, 0.5],
  ];
  return tramos.map(([minQty, factor]) => ({
    minQty,
    unitPriceCents: Math.round(baseCents * factor),
  }));
}

function pickPopularIndex(rows: Array<{ minQty: number }>): number {
  // "Popular" = el tramo más cercano a 100 uds (sweet spot B2B)
  let best = 0;
  let bestDiff = Infinity;
  rows.forEach((r, i) => {
    const diff = Math.abs(r.minQty - 100);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}
