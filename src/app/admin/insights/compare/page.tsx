/**
 * /admin/insights/compare — comparación side-by-side de dos periodos.
 *
 * Default: últimos 30 días vs 30 días previos. Selector cambia preset
 * por query param (?preset=7d|30d|90d|month_to_date|previous_month).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import {
  buildComparison,
  getKpisForRange,
  resolvePreset,
  type RangePreset,
} from "@/lib/insights/compare";

export const metadata: Metadata = {
  title: "Comparar periodos · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const VALID_PRESETS: RangePreset[] = [
  "7d",
  "30d",
  "90d",
  "month_to_date",
  "previous_month",
];

const PRESET_LABELS: Record<RangePreset, string> = {
  "7d": "7d vs 7d previos",
  "30d": "30d vs 30d previos",
  "90d": "90d vs 90d previos",
  month_to_date: "Mes en curso vs mes pasado",
  previous_month: "Mes pasado vs anterior",
};

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(d);

function DeltaBadge({ pct, positiveIsGood }: { pct: number; positiveIsGood: boolean }) {
  if (pct === 0) {
    return (
      <span className="rounded-full bg-bone-soft px-2 py-0.5 text-[10px] font-medium text-ink/50">
        =
      </span>
    );
  }
  const isUp = pct > 0;
  const good = positiveIsGood ? isUp : !isUp;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        good
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700"
      }`}
    >
      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default async function ComparePeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { preset: presetRaw } = await searchParams;
  const preset: RangePreset = VALID_PRESETS.includes(presetRaw as RangePreset)
    ? (presetRaw as RangePreset)
    : "30d";

  const { a: aRange, b: bRange } = resolvePreset(preset);
  const [a, b] = await Promise.all([
    getKpisForRange(aRange.from, aRange.to, aRange.label),
    getKpisForRange(bRange.from, bRange.to, bRange.label),
  ]);
  const comparison = buildComparison(a, b);

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <span>Comparar periodos</span>
        </nav>

        <h1 className="font-display text-3xl font-semibold text-ink">
          Comparar periodos
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Métricas side-by-side de dos rangos arbitrarios. La columna A es el
          periodo más reciente; el delta compara A vs B.
        </p>

        {/* Selector de preset */}
        <nav className="mt-6 flex flex-wrap gap-2">
          {VALID_PRESETS.map((p) => (
            <Link
              key={p}
              href={`/admin/insights/compare?preset=${p}`}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                p === preset
                  ? "bg-ink text-bone"
                  : "border border-line bg-bone hover:bg-bone-soft"
              }`}
            >
              {PRESET_LABELS[p]}
            </Link>
          ))}
        </nav>

        {/* Periodos */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-accent/30 bg-accent-wash/40 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-accent-deep">
              A · actual
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {a.label}
            </p>
            <p className="mt-0.5 text-xs text-ink/55">
              {fmtDate(a.from)} – {fmtDate(a.to)}
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-bone p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
              B · referencia
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {b.label}
            </p>
            <p className="mt-0.5 text-xs text-ink/55">
              {fmtDate(b.from)} – {fmtDate(b.to)}
            </p>
          </div>
        </div>

        {/* Tabla comparativa */}
        <section className="mt-8 overflow-x-auto rounded-3xl border border-line bg-bone">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-bone-soft text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-ink/70">Métrica</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">A</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">B</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">Δ abs</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">Δ %</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.metric} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.metric}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                    {row.a.toLocaleString("es-ES")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                    {row.b.toLocaleString("es-ES")}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      row.deltaAbs > 0
                        ? row.positiveIsGood
                          ? "text-emerald-700"
                          : "text-rose-700"
                        : row.deltaAbs < 0
                          ? row.positiveIsGood
                            ? "text-rose-700"
                            : "text-emerald-700"
                          : "text-ink/55"
                    }`}
                  >
                    {row.deltaAbs > 0 ? "+" : ""}
                    {row.deltaAbs.toLocaleString("es-ES")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeltaBadge pct={row.deltaPct} positiveIsGood={row.positiveIsGood} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Resumen narrativo */}
        <section className="mt-6 rounded-3xl border border-line bg-bone-soft p-5">
          <h2 className="font-display text-sm font-semibold text-ink">
            Lectura rápida
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/75">
            {comparison
              .filter((r) => r.deltaPct !== 0)
              .sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct))
              .slice(0, 4)
              .map((r) => {
                const isUp = r.deltaPct > 0;
                const good = r.positiveIsGood ? isUp : !isUp;
                return (
                  <li key={r.metric}>
                    <span
                      className={`mr-2 font-semibold ${
                        good ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isUp ? "↑" : "↓"} {Math.abs(r.deltaPct).toFixed(1)}%
                    </span>
                    <strong>{r.metric}</strong>: {r.a.toLocaleString("es-ES")} vs{" "}
                    {r.b.toLocaleString("es-ES")}
                  </li>
                );
              })}
            {comparison.every((r) => r.deltaPct === 0) && (
              <li className="text-ink/55">
                Sin cambios entre los dos periodos.
              </li>
            )}
          </ul>
        </section>

        {/* Disclaimer */}
        <p className="mt-6 text-[11px] text-ink/45">
          Nota: «productos vistos (únicos)» cuenta productos con
          <code> lastViewedAt </code> en el rango, no views acumuladas, así que
          recientes pueden estar sobre-representados respecto a periodos
          antiguos donde el rolling de vistas ya se ha decantado. El resto de
          métricas son exactas.
        </p>
      </div>
    </>
  );
}
