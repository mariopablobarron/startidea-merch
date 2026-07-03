/**
 * /admin/quick — dashboard condensado mobile-first.
 *
 * Pensado para revisar mientras vas en el coche o desde el móvil sin abrir
 * el panel completo. Solo lo crítico:
 *  - KPI hero (propuestas/semana)
 *  - 3 sugerencias top
 *  - 3 productos top
 *
 * Link directo en /admin/insights y en el menú admin.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import {
  getConversionFunnel,
  getSuggestions,
  getTopViewedProducts,
  getCatalogHealth,
} from "@/lib/insights";

export const metadata: Metadata = {
  title: "Quick · TodoMerch",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

const SEV_BG: Record<string, string> = {
  critical: "bg-accent-wash border-accent-deep/30",
  warning: "bg-amber-50 border-amber-300",
  opportunity: "bg-emerald-50 border-emerald-300",
  info: "bg-bone-soft border-line",
};

const SEV_EMOJI: Record<string, string> = {
  critical: "🚨",
  warning: "⚠️",
  opportunity: "💡",
  info: "ℹ️",
};

export default async function QuickPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [funnel, suggestions, top, health] = await Promise.all([
    getConversionFunnel(),
    getSuggestions(),
    getTopViewedProducts(3, "30d"),
    getCatalogHealth(),
  ]);

  function deltaBadge(value: number) {
    if (value === 0) return null;
    const positive = value > 0;
    return (
      <span
        className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          positive ? "bg-emerald-100 text-emerald-700" : "bg-accent-wash text-accent-deep"
        }`}
      >
        {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
      </span>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-md px-4 py-6">
        <nav className="mb-4 flex items-center justify-between text-xs">
          <Link href="/admin/insights" className="text-ink/55 hover:text-accent">
            ← Dashboard completo
          </Link>
          <span className="text-ink/40">Quick view</span>
        </nav>

        {/* Hero KPI */}
        <div className="rounded-3xl bg-ink p-7 text-bone">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-bone/60">
            Propuestas últimos 30 días
          </p>
          <p className="mt-2 font-display text-5xl font-bold tabular-nums">
            {funnel.proposals30d}
            {deltaBadge(funnel.proposals30dDelta)}
          </p>
          <p className="mt-2 text-sm text-bone/70">
            {funnel.proposalConvPct}% conversión desde carrito
          </p>
        </div>

        {/* Mini funnel */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-line bg-bone p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-ink/55">Views</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {funnel.views30d}
            </p>
            {deltaBadge(funnel.views30dDelta)}
          </div>
          <div className="rounded-2xl border border-line bg-bone p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-ink/55">Cart</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {funnel.cartAdds30d}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-bone p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-ink/55">IA</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {funnel.recommenderQueries30d}
            </p>
            {deltaBadge(funnel.recommender30dDelta)}
          </div>
        </div>

        {/* Sugerencias top 3 */}
        {suggestions.length > 0 && (
          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">
              Para hoy
            </p>
            <ul className="mt-2 space-y-2">
              {suggestions.slice(0, 3).map((s) => (
                <li key={s.id} className={`rounded-2xl border p-4 ${SEV_BG[s.severity]}`}>
                  <p className="font-display text-sm font-semibold text-ink">
                    {SEV_EMOJI[s.severity]} {s.title}
                  </p>
                  <p className="mt-1.5 text-xs text-ink/70 leading-relaxed">
                    {s.body}
                  </p>
                  {s.action && (
                    <Link
                      href={s.action.href}
                      className="mt-2 inline-block text-xs font-medium text-accent"
                    >
                      {s.action.label} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Top 3 productos */}
        {top.length > 0 && (
          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">
              Top productos 30d
            </p>
            <ul className="mt-2 space-y-1.5">
              {top.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 rounded-2xl bg-bone-soft px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-ink/40">
                    {i + 1}
                  </span>
                  <Link
                    href={`/catalogo/${p.slug}`}
                    target="_blank"
                    className="flex-1 truncate text-sm text-ink"
                  >
                    {p.name}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-ink/55">
                    {p.view30d}v
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2 text-center text-xs text-ink/60">
          <Link
            href="/admin/propuestas"
            className="rounded-full bg-bone-soft px-3 py-2 hover:bg-bone"
          >
            Propuestas →
          </Link>
          <Link
            href="/admin/insights/notifications"
            className="rounded-full bg-bone-soft px-3 py-2 hover:bg-bone"
          >
            Notificaciones →
          </Link>
        </div>

        <p className="mt-6 text-center text-[10px] text-ink/40">
          Catálogo: {health.activeProducts.toLocaleString("es-ES")} productos · {health.pctStock}% stock
        </p>
      </div>
    </>
  );
}
