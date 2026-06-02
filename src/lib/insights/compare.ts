/**
 * Helpers para comparar KPIs entre dos rangos arbitrarios.
 *
 * No reutilizamos getConversionFunnel() porque ese fija ventanas hardcoded
 * de 30/60 días — aquí queremos rangos parametrizables.
 *
 * Métricas exactas (basadas en timestamps):
 *  - recommenderQueries: count por createdAt
 *  - proposals: count por sentAt
 *  - errors: count por createdAt en ErrorEvent
 *  - searchQueries: count por createdAt
 *
 * Métrica aproximada:
 *  - productsViewedUnique: productos con lastViewedAt en el rango
 *    (no es "views únicas en el rango" — eso requeriría log raw que
 *    no guardamos por coste de storage).
 */
import { prisma } from "@/lib/prisma";

export type PeriodKpis = {
  from: Date;
  to: Date;
  label: string;
  recommenderQueries: number;
  proposals: number;
  errors: number;
  searchQueries: number;
  productsViewedUnique: number;
};

export type ComparisonRow = {
  metric: string;
  unit?: string;
  a: number;
  b: number;
  deltaAbs: number;
  deltaPct: number; // percent change A vs B; null encoded as 0 if B=0 and A=0
  positiveIsGood: boolean; // para colorear arriba/abajo
};

export async function getKpisForRange(
  from: Date,
  to: Date,
  label: string,
): Promise<PeriodKpis> {
  const where = { gte: from, lt: to };
  const [recommenderQueries, proposals, errors, searchQueries, productsViewedUnique] =
    await Promise.all([
      prisma.recommenderQuery.count({ where: { createdAt: where } }),
      prisma.proposal.count({ where: { sentAt: where } }),
      prisma.errorEvent.count({ where: { createdAt: where } }),
      prisma.searchQuery.count({ where: { createdAt: where } }),
      prisma.productView.count({ where: { lastViewedAt: where } }),
    ]);
  return {
    from,
    to,
    label,
    recommenderQueries,
    proposals,
    errors,
    searchQueries,
    productsViewedUnique,
  };
}

function deltaPct(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

type Intermediate = {
  metric: string;
  aVal: number;
  bVal: number;
  positiveIsGood: boolean;
};

export function buildComparison(
  a: PeriodKpis,
  b: PeriodKpis,
): ComparisonRow[] {
  const rows: Intermediate[] = [
    {
      metric: "Productos vistos (únicos)",
      aVal: a.productsViewedUnique,
      bVal: b.productsViewedUnique,
      positiveIsGood: true,
    },
    {
      metric: "Búsquedas",
      aVal: a.searchQueries,
      bVal: b.searchQueries,
      positiveIsGood: true,
    },
    {
      metric: "Consultas al recomendador",
      aVal: a.recommenderQueries,
      bVal: b.recommenderQueries,
      positiveIsGood: true,
    },
    {
      metric: "Propuestas enviadas",
      aVal: a.proposals,
      bVal: b.proposals,
      positiveIsGood: true,
    },
    {
      metric: "Errores capturados",
      aVal: a.errors,
      bVal: b.errors,
      positiveIsGood: false,
    },
  ];

  return rows.map((r) => ({
    metric: r.metric,
    a: r.aVal,
    b: r.bVal,
    deltaAbs: r.aVal - r.bVal,
    deltaPct: deltaPct(r.aVal, r.bVal),
    positiveIsGood: r.positiveIsGood,
  }));
}

// ─── Presets de rangos ───────────────────────────────────────────────────

export type RangePreset =
  | "7d"
  | "30d"
  | "90d"
  | "month_to_date"
  | "previous_month";

export function resolvePreset(preset: RangePreset): {
  a: { from: Date; to: Date; label: string };
  b: { from: Date; to: Date; label: string };
} {
  const now = new Date();
  const day = 24 * 3600 * 1000;
  switch (preset) {
    case "7d":
      return {
        a: {
          from: new Date(now.getTime() - 7 * day),
          to: now,
          label: "Últimos 7 días",
        },
        b: {
          from: new Date(now.getTime() - 14 * day),
          to: new Date(now.getTime() - 7 * day),
          label: "7 días previos",
        },
      };
    case "30d":
      return {
        a: {
          from: new Date(now.getTime() - 30 * day),
          to: now,
          label: "Últimos 30 días",
        },
        b: {
          from: new Date(now.getTime() - 60 * day),
          to: new Date(now.getTime() - 30 * day),
          label: "30 días previos",
        },
      };
    case "90d":
      return {
        a: {
          from: new Date(now.getTime() - 90 * day),
          to: now,
          label: "Últimos 90 días",
        },
        b: {
          from: new Date(now.getTime() - 180 * day),
          to: new Date(now.getTime() - 90 * day),
          label: "90 días previos",
        },
      };
    case "month_to_date": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dayOfMonth = now.getDate();
      // periodo B: mismo número de días pero del mes pasado
      const prevMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const prevMonthMatching = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        dayOfMonth,
      );
      return {
        a: {
          from: monthStart,
          to: now,
          label: `Mes en curso (1–${dayOfMonth})`,
        },
        b: {
          from: prevMonthStart,
          to: prevMonthMatching,
          label: `Mismo periodo del mes pasado`,
        },
      };
    }
    case "previous_month": {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const prevPrevMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 2,
        1,
      );
      return {
        a: {
          from: prevMonthStart,
          to: thisMonthStart,
          label: "Mes pasado",
        },
        b: {
          from: prevPrevMonthStart,
          to: prevMonthStart,
          label: "Anterior al mes pasado",
        },
      };
    }
  }
}
