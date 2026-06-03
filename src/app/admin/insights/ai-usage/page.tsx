/**
 * /admin/insights/ai-usage — vista detallada del coste IA.
 *
 * Tres ventanas seleccionables (7d, 30d, 90d). Gráfica de barras
 * inline (CSS, sin Chart.js para evitar dependencias). Proyección
 * mensual estimada del coste actual.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { getAiUsageStats } from "@/lib/insights/ai-usage";

export const metadata: Metadata = {
  title: "Uso IA · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const VALID_WINDOWS = [7, 30, 90] as const;
type Window = (typeof VALID_WINDOWS)[number];

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { window: windowRaw } = await searchParams;
  const windowDays: Window = VALID_WINDOWS.includes(
    parseInt(windowRaw ?? "30", 10) as Window,
  )
    ? (parseInt(windowRaw ?? "30", 10) as Window)
    : 30;

  const stats = await getAiUsageStats(windowDays);
  const avgPerDay = stats.totalCostEur / windowDays;
  const projectedMonth = avgPerDay * 30;
  const maxDayCost = stats.byDay.reduce(
    (max, d) => Math.max(max, d.costEur),
    0,
  );

  return (
    <AdminChrome>
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
          <span>Uso IA</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          🤖 Uso IA · OpenRouter
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Coste estimado agregando recomendador público + generador de
          propuestas admin + voice agent + suggestions dashboard.
        </p>

        {/* Selector ventana */}
        <nav className="mt-6 flex flex-wrap gap-2">
          {VALID_WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/admin/insights/ai-usage?window=${w}`}
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                w === windowDays
                  ? "bg-ink text-bone"
                  : "border border-line bg-bone hover:bg-bone-soft"
              }`}
            >
              Últimos {w} días
            </Link>
          ))}
        </nav>

        {stats.totalQueries === 0 ? (
          <p className="mt-8 rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/55">
            Sin actividad IA en los últimos {windowDays} días.
          </p>
        ) : (
          <>
            {/* KPIs */}
            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Coste total"
                value={`${stats.totalCostEur.toFixed(2)} €`}
                hint={`~${avgPerDay.toFixed(2)} €/día`}
                accent
              />
              <Kpi
                label="Proyección mensual"
                value={`${projectedMonth.toFixed(2)} €`}
                hint="al ritmo actual × 30 días"
              />
              <Kpi
                label="Consultas"
                value={stats.totalQueries.toLocaleString("es-ES")}
                hint={`~${(stats.totalQueries / windowDays).toFixed(1)}/día`}
              />
              <Kpi
                label="Tokens totales"
                value={`${((stats.totalPromptTokens + stats.totalCompletionTokens) / 1000).toFixed(0)}K`}
                hint={`in: ${(stats.totalPromptTokens / 1000).toFixed(0)}K · out: ${(stats.totalCompletionTokens / 1000).toFixed(0)}K`}
              />
            </section>

            {/* Gráfica diaria */}
            {stats.byDay.length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-base font-semibold text-ink">
                  Coste diario
                </h2>
                <div className="mt-3 rounded-3xl border border-line bg-bone p-4">
                  <div className="space-y-1">
                    {stats.byDay.map((d) => (
                      <div
                        key={d.day}
                        className="flex items-center gap-3 text-[11px]"
                      >
                        <span className="w-20 shrink-0 font-mono text-ink/55">
                          {d.day.slice(5)}
                        </span>
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-bone-soft">
                          <div
                            className={`h-full ${
                              d.costEur > stats.totalCostEur / windowDays * 1.5
                                ? "bg-accent"
                                : "bg-ink/70"
                            }`}
                            style={{
                              width: maxDayCost > 0
                                ? `${(d.costEur / maxDayCost) * 100}%`
                                : "0%",
                            }}
                          />
                          <span className="absolute inset-y-0 right-2 flex items-center font-mono text-ink/85">
                            {d.costEur > 0 ? `${d.costEur.toFixed(2)} €` : ""}
                          </span>
                        </div>
                        <span className="w-12 shrink-0 text-right tabular-nums text-ink/55">
                          {d.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-ink/45">
                  Barras de color destacado: días con coste &gt; 1.5× la media.
                  Número derecha: consultas del día.
                </p>
              </section>
            )}

            {/* Por modelo */}
            <section className="mt-8">
              <h2 className="font-display text-base font-semibold text-ink">
                Desglose por modelo
              </h2>
              <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-bone">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="border-b border-line bg-bone-soft text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium text-ink/70">
                        Modelo
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-ink/70">
                        Consultas
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-ink/70">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-ink/70">
                        € estimado
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-ink/70">
                        % total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byModel.map((m) => (
                      <tr
                        key={m.modelUsed}
                        className="border-b border-line/60 last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-[11px] text-ink/90">
                          {m.modelUsed}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {m.count}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                          {((m.promptTokens + m.completionTokens) / 1000).toFixed(1)}K
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {m.costEur.toFixed(2)} €
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink/55">
                          {stats.totalCostEur > 0
                            ? `${((m.costEur / stats.totalCostEur) * 100).toFixed(0)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Por mode */}
            <section className="mt-8">
              <h2 className="font-display text-base font-semibold text-ink">
                Desglose por endpoint
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {stats.byMode.map((md) => (
                  <div
                    key={md.mode}
                    className="rounded-2xl border border-line bg-bone p-4"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-ink/55">
                      {md.mode}
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold text-ink">
                      {md.costEur.toFixed(2)} €
                    </p>
                    <p className="text-[11px] text-ink/55">
                      {md.count} consultas
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ink/45">
                <code>recommend</code> = recomendador público ·{" "}
                <code>quote</code> = cotizador del recomendador ·{" "}
                <code>proposal</code> = generador admin
              </p>
            </section>
          </>
        )}
      </div>
    </AdminChrome>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-5 ${
        accent ? "bg-ink text-bone" : "border border-line bg-bone"
      }`}
    >
      <p
        className={`text-[10px] font-medium uppercase tracking-wider ${
          accent ? "text-bone/60" : "text-ink/60"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      {hint && (
        <p
          className={`mt-1 text-[11px] ${
            accent ? "text-bone/65" : "text-ink/55"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
