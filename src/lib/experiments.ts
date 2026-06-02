/**
 * A/B testing — asignación determinística por hash(anonId + slug).
 *
 * Mismo visitante = misma variante siempre (durante la vida del cookie).
 * El admin define el experiment en /admin/insights/experiments con
 * variantes y pesos. El frontend pide la variante con getActiveVariant.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export type Variant = {
  key: string; // "A" | "B" | ...
  weight: number; // 0-100, deben sumar 100
  config: Record<string, unknown>;
};

export type ExperimentResult = {
  experimentId: string;
  variantKey: string;
  config: Record<string, unknown>;
};

/**
 * Asigna determinístico al visitante una variante del experiment activo.
 * Si no hay experiment activo con ese slug → devuelve null (frontend usa
 * fallback hardcoded).
 *
 * Algoritmo: hash(anonId + slug) → número 0-99 → matchea por intervalos
 * de peso acumulado de las variantes.
 */
export async function getActiveVariant(
  slug: string,
  anonId: string,
): Promise<ExperimentResult | null> {
  const exp = await prisma.experiment.findUnique({
    where: { slug },
    select: { id: true, active: true, variants: true },
  });
  if (!exp?.active) return null;
  const variants = exp.variants as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) return null;

  // Hash determinístico
  const hash = crypto
    .createHash("sha256")
    .update(`${anonId}:${slug}`)
    .digest();
  const bucket = hash.readUInt8(0) % 100; // 0-99

  // Match por peso acumulado
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (bucket < acc) {
      return {
        experimentId: exp.id,
        variantKey: v.key,
        config: v.config,
      };
    }
  }
  // Fallback al último (en caso de rounding errors)
  const last = variants[variants.length - 1];
  return {
    experimentId: exp.id,
    variantKey: last.key,
    config: last.config,
  };
}

export async function recordExperimentEvent(
  experimentId: string,
  variantKey: string,
  event: string,
  anonId?: string,
): Promise<void> {
  try {
    await prisma.experimentEvent.create({
      data: { experimentId, variantKey, event, anonId: anonId ?? null },
    });
  } catch {
    // Silencioso
  }
}

export type VariantStats = {
  variantKey: string;
  views: number;
  cartAdds: number;
  conversions: number; // proposal o conversion event
  convPct: number;
};

export type ExperimentStats = {
  experimentId: string;
  slug: string;
  name: string;
  variants: VariantStats[];
  winner: string | null;
  significance: number; // 0-1 (1 = altísima)
  totalEvents: number;
};

/**
 * Calcula estadísticas por variante con z-test simple para significance.
 * No es un t-test perfecto, pero da una estimación útil para decisiones.
 */
export async function getExperimentStats(slug: string): Promise<ExperimentStats | null> {
  const exp = await prisma.experiment.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, variants: true },
  });
  if (!exp) return null;

  const grouped = await prisma.$queryRaw<
    Array<{ variantkey: string; event: string; count: bigint }>
  >`
    SELECT "variantKey" AS variantkey, "event", COUNT(*) AS count
    FROM "ExperimentEvent"
    WHERE "experimentId" = ${exp.id}
    GROUP BY "variantKey", "event"
  `;

  const byVariant = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    if (!byVariant.has(row.variantkey)) byVariant.set(row.variantkey, {});
    byVariant.get(row.variantkey)![row.event] = Number(row.count);
  }

  const variantsArr = (exp.variants as unknown as Variant[]) || [];
  const stats: VariantStats[] = variantsArr.map((v) => {
    const counts = byVariant.get(v.key) || {};
    const views = counts.view ?? 0;
    const cartAdds = counts.cart_add ?? 0;
    const conversions = (counts.proposal ?? 0) + (counts.conversion ?? 0);
    const convPct = views > 0 ? (conversions / views) * 100 : 0;
    return { variantKey: v.key, views, cartAdds, conversions, convPct };
  });

  // Determinar winner + significance (z-test entre top 2)
  const sorted = [...stats].sort((a, b) => b.convPct - a.convPct);
  let winner: string | null = null;
  let significance = 0;
  if (sorted.length >= 2 && sorted[0].views >= 30 && sorted[1].views >= 30) {
    const p1 = sorted[0].conversions / sorted[0].views;
    const p2 = sorted[1].conversions / sorted[1].views;
    const pooled =
      (sorted[0].conversions + sorted[1].conversions) /
      (sorted[0].views + sorted[1].views);
    const se = Math.sqrt(
      pooled * (1 - pooled) * (1 / sorted[0].views + 1 / sorted[1].views),
    );
    if (se > 0) {
      const z = (p1 - p2) / se;
      // Aproximar P(Z>z) con función erf simplificada
      significance = Math.min(1, Math.max(0, normalCdf(Math.abs(z))));
      if (significance >= 0.95) winner = sorted[0].variantKey;
    }
  }

  const totalEvents = stats.reduce(
    (sum, s) => sum + s.views + s.cartAdds + s.conversions,
    0,
  );

  return {
    experimentId: exp.id,
    slug: exp.slug,
    name: exp.name,
    variants: stats,
    winner,
    significance,
    totalEvents,
  };
}

// Aproximación de CDF normal (función phi)
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
