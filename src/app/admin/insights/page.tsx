import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import {
  getCatalogHealth,
  getSupplierStatuses,
  getTopViewedProducts,
  getSuggestions,
  getConversionFunnel,
  getTopCategories,
  getTopSearchQueries,
  getSearchQueriesNoResults,
  getHourlyHeatmap,
  getOverpricedProducts,
  getCarmenStats,
  type Suggestion,
} from "@/lib/insights";
import { getAISuggestions } from "@/lib/insights/ai-suggestions";

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export const metadata: Metadata = {
  title: "Insights · Panel decisiones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SUPPLIER_LABEL: Record<string, string> = {
  midocean: "MidOcean",
  makito: "Makito",
  cifra: "Cifra",
};

const SEVERITY_STYLES: Record<Suggestion["severity"], { bg: string; border: string; text: string; label: string }> = {
  critical: {
    bg: "bg-accent-wash",
    border: "border-accent-deep/30",
    text: "text-accent-deep",
    label: "🚨 Crítico",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-900",
    label: "⚠️ Atención",
  },
  opportunity: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-900",
    label: "💡 Oportunidad",
  },
  info: {
    bg: "bg-bone-soft",
    border: "border-line",
    text: "text-ink/70",
    label: "ℹ️ Info",
  },
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function Heatmap({ cells }: { cells: { dow: number; hour: number; visits: number }[] }) {
  if (cells.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/60">
        Aún no hay datos de heatmap. Empezará a llenarse con los views recogidos.
      </p>
    );
  }

  // Construir matriz 7×24
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const c of cells) {
    if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
      matrix[c.dow][c.hour] = c.visits;
      if (c.visits > max) max = c.visits;
    }
  }

  function color(v: number): string {
    if (v === 0) return "bg-bone-soft";
    const intensity = max > 0 ? v / max : 0;
    if (intensity > 0.8) return "bg-accent-deep text-bone";
    if (intensity > 0.6) return "bg-accent text-bone";
    if (intensity > 0.4) return "bg-accent/70 text-bone";
    if (intensity > 0.2) return "bg-accent/40";
    return "bg-accent/15";
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone p-4">
      <table className="w-full min-w-[680px] text-[10px]">
        <thead>
          <tr>
            <th className="w-12"></th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-0.5 py-1 font-mono text-ink/40">
                {h.toString().padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOW_LABELS.map((label, dow) => (
            <tr key={dow}>
              <td className="pr-2 text-right font-mono text-[11px] font-semibold text-ink/60">
                {label}
              </td>
              {Array.from({ length: 24 }, (_, h) => {
                const v = matrix[dow][h];
                return (
                  <td key={h} className="p-0.5">
                    <div
                      className={`flex h-6 items-center justify-center rounded ${color(v)} font-mono text-[9px]`}
                      title={`${label} · ${h}:00 UTC · ${v} visitas`}
                    >
                      {v > 0 ? v : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-ink/50">
        Hora UTC · color = intensidad relativa al máximo del mapa ({max} visitas)
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: "success" | "warn" | "danger";
}) {
  const ring =
    highlight === "danger"
      ? "ring-2 ring-accent/40"
      : highlight === "warn"
        ? "ring-2 ring-amber-300"
        : highlight === "success"
          ? "ring-2 ring-emerald-300"
          : "";
  return (
    <div className={`rounded-3xl border border-line bg-bone p-5 ${ring}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/55">{hint}</p>}
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ heatmap?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { heatmap: heatmapWindowRaw } = await searchParams;
  const heatmapWindow: "7d" | "30d" = heatmapWindowRaw === "7d" ? "7d" : "30d";

  const [
    health,
    suppliers,
    top,
    suggestions,
    funnel,
    categories,
    topSearches,
    noResultSearches,
    heatmap,
    overpriced,
    carmen,
  ] = await Promise.all([
    getCatalogHealth(),
    getSupplierStatuses(),
    getTopViewedProducts(20, "30d"),
    getSuggestions(),
    getConversionFunnel(),
    getTopCategories(10),
    getTopSearchQueries(15, "30d").catch(() => []),
    getSearchQueriesNoResults(15, "30d").catch(() => []),
    getHourlyHeatmap(heatmapWindow).catch(() => []),
    getOverpricedProducts(10).catch(() => []),
    getCarmenStats().catch(() => null),
  ]);
  // AI suggestions en paralelo pero permitiendo fallback (no bloquea el panel)
  const aiSuggestions = await getAISuggestions().catch(() => []);

  const totalViews30d = top.reduce((sum, p) => sum + p.view30d, 0);
  const totalCarts = top.reduce((sum, p) => sum + p.cartAddCount, 0);

  return (
    <AdminChrome>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <span>Insights</span>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              Insights del negocio
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              Salud del catálogo, estado de proveedores, productos populares y
              sugerencias para vender más. Datos en tiempo real.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="text-ink/55">Exportar:</span>
            {[
              { type: "top-products", label: "Top productos" },
              { type: "search-queries", label: "Búsquedas" },
              { type: "search-no-results", label: "Sin resultados" },
              { type: "categories", label: "Categorías" },
              { type: "overpriced", label: "Outliers precio" },
              { type: "suppliers", label: "Proveedores" },
            ].map((e) => (
              <a
                key={e.type}
                href={`/api/admin/insights/export?type=${e.type}`}
                className="rounded-full border border-line bg-bone px-2.5 py-1 text-ink/70 hover:border-accent hover:text-accent"
              >
                {e.label} ↓
              </a>
            ))}
          </div>
        </div>

        {/* ─── Sugerencias IA (LLM analiza el contexto y propone acciones) ─── */}
        {aiSuggestions.length > 0 && (
          <section className="mt-8" id="ai-sugerencias">
            <h2 className="font-display text-xl font-semibold text-ink">
              🤖 Acciones recomendadas por IA esta semana
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Análisis del estado real del catálogo + funnel + búsquedas por
              Claude. Cache 6h — refresca solo si los datos cambian
              significativamente.
            </p>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {aiSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="rounded-3xl border border-line bg-gradient-to-br from-bone to-bone-soft p-5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
                    {s.category}
                  </p>
                  <h3 className="mt-2 font-display text-base font-semibold text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink/75">{s.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Sugerencias por reglas (más rápidas y específicas) ─── */}
        <section className="mt-8" id="sugerencias">
          <h2 className="font-display text-xl font-semibold text-ink">
            🎯 Sugerencias para decidir hoy
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Generadas a partir del estado real del catálogo, proveedores y
            engagement de los visitantes.
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/60">
              Sin sugerencias hoy — tu catálogo está en buena forma 🎉
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {suggestions.map((s) => {
                const st = SEVERITY_STYLES[s.severity];
                return (
                  <li
                    key={s.id}
                    className={`rounded-3xl border ${st.border} ${st.bg} p-5`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${st.text}`}>
                        {st.label}
                      </p>
                      {s.metric && (
                        <span className="rounded-full border border-line/60 bg-bone px-2 py-0.5 text-[10px] font-mono text-ink/60">
                          {s.metric}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-base font-semibold text-ink">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-sm text-ink/70">{s.body}</p>
                    {s.action && (
                      <Link
                        href={s.action.href}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        {s.action.label} →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ─── Salud del catálogo ─── */}
        <section className="mt-12" id="salud">
          <h2 className="font-display text-xl font-semibold text-ink">
            📦 Salud del catálogo
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Productos activos"
              value={health.activeProducts.toLocaleString("es-ES")}
              hint={`${health.totalProducts.toLocaleString("es-ES")} en BD total`}
            />
            <KpiCard
              label="Variantes (SKUs)"
              value={health.totalVariants.toLocaleString("es-ES")}
              hint={`${health.variantsWithPrice.toLocaleString("es-ES")} con precio (100%)`}
              highlight="success"
            />
            <KpiCard
              label="Variantes con stock"
              value={`${health.pctStock}%`}
              hint={`${health.variantsWithStock.toLocaleString("es-ES")} de ${health.totalVariants.toLocaleString("es-ES")}`}
              highlight={health.pctStock >= 80 ? "success" : health.pctStock >= 60 ? "warn" : "danger"}
            />
            <KpiCard
              label="% con imagen"
              value={`${health.pctImage}%`}
              hint={`${health.productsWithImage.toLocaleString("es-ES")} de ${health.activeProducts.toLocaleString("es-ES")} activos`}
              highlight={health.pctImage >= 90 ? "success" : health.pctImage >= 70 ? "warn" : "danger"}
            />
          </div>
        </section>

        {/* ─── Estado proveedores ─── */}
        <section className="mt-12" id="proveedores">
          <h2 className="font-display text-xl font-semibold text-ink">
            🔌 Proveedores en tiempo real
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Stock se actualiza con cron diario. Si pasa de 26h sin sync, se
            avisa arriba como sugerencia.
          </p>
          <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b border-line bg-bone-soft text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-ink/70">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">Productos</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">Activos</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">Variantes</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">Con stock</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">% Stock</th>
                  <th className="px-4 py-3 font-medium text-ink/70">Última sync stock</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const stale = s.hoursStaleStock !== null && s.hoursStaleStock > 26;
                  const noStock = s.variants > 0 && s.pctStock === 0;
                  return (
                    <tr key={s.supplier} className="border-b border-line/60">
                      <td className="px-4 py-3 font-medium text-ink">
                        {SUPPLIER_LABEL[s.supplier] ?? s.supplier}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/80">
                        {s.products.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/80">
                        {s.activeProducts.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/80">
                        {s.variants.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/80">
                        {s.variantsWithStock.toLocaleString("es-ES")}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-semibold ${
                          noStock ? "text-accent-deep" : s.pctStock >= 80 ? "text-emerald-700" : s.pctStock >= 50 ? "text-amber-700" : "text-accent-deep"
                        }`}
                      >
                        {s.pctStock}%
                      </td>
                      <td className={`px-4 py-3 text-xs ${stale ? "text-accent-deep font-medium" : "text-ink/60"}`}>
                        {fmtDate(s.lastStockUpdate)}
                        {stale && s.hoursStaleStock !== null && (
                          <span className="ml-2 rounded-full bg-accent-wash px-1.5 py-0.5 text-[10px] font-semibold">
                            {s.hoursStaleStock}h stale
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Funnel ─── */}
        <section className="mt-12" id="funnel">
          <h2 className="font-display text-xl font-semibold text-ink">
            🔻 Conversión últimos 30 días
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Del visitante al pedido cerrado. Tasas típicas B2B: 1-3% views→carrito · 10-25% carrito→propuesta.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Views catálogo"
              value={funnel.views30d.toLocaleString("es-ES")}
              hint={
                funnel.views30dDelta !== 0
                  ? `${funnel.views30dDelta > 0 ? "▲" : "▼"} ${Math.abs(funnel.views30dDelta).toFixed(1)}% vs 30d previos`
                  : "Visitas únicas a fichas de producto"
              }
            />
            <KpiCard
              label="Añadidos a carrito"
              value={funnel.cartAdds30d.toLocaleString("es-ES")}
              hint={`${funnel.cartConvPct}% conversión views → carrito`}
              highlight={funnel.cartConvPct >= 2 ? "success" : funnel.cartConvPct >= 1 ? "warn" : "danger"}
            />
            <KpiCard
              label="Consultas recomendador"
              value={funnel.recommenderQueries30d.toLocaleString("es-ES")}
              hint={
                funnel.recommender30dDelta !== 0
                  ? `${funnel.recommender30dDelta > 0 ? "▲" : "▼"} ${Math.abs(funnel.recommender30dDelta).toFixed(1)}% vs prev`
                  : "Briefs procesados por la IA"
              }
            />
            <KpiCard
              label="Propuestas enviadas"
              value={funnel.proposals30d.toLocaleString("es-ES")}
              hint={
                funnel.proposals30dDelta !== 0
                  ? `${funnel.proposalConvPct}% conv · ${funnel.proposals30dDelta > 0 ? "▲" : "▼"} ${Math.abs(funnel.proposals30dDelta).toFixed(1)}% vs prev`
                  : `${funnel.proposalConvPct}% conversión carrito → propuesta`
              }
              highlight={funnel.proposalConvPct >= 15 ? "success" : funnel.proposalConvPct >= 5 ? "warn" : "danger"}
            />
          </div>
        </section>

        {/* ─── Categorías ─── */}
        <section className="mt-12" id="categorias">
          <h2 className="font-display text-xl font-semibold text-ink">
            📊 Categorías por engagement (30 días)
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Qué categorías están moviendo el catálogo. Útil para decidir qué
            potenciar en home, ads o newsletter.
          </p>
          {categories.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/60">
              Sin datos aún — el tracking empieza ahora.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b border-line bg-bone-soft text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink/70">Categoría</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Productos</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Views 30d</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Carrito 30d</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Conv. %</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const conv = c.views30d > 0 ? Math.round((c.cartAdds30d / c.views30d) * 1000) / 10 : 0;
                    return (
                      <tr key={c.categoryId ?? "none"} className="border-b border-line/60">
                        <td className="px-4 py-3 font-medium text-ink">{c.categoryName}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                          {c.products.toLocaleString("es-ES")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                          {c.views30d.toLocaleString("es-ES")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                          {c.cartAdds30d.toLocaleString("es-ES")}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums ${conv >= 2 ? "text-emerald-700 font-semibold" : "text-ink/55"}`}>
                          {conv}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Outliers precio ─── */}
        {overpriced.length > 0 && (
          <section className="mt-12" id="overpriced">
            <h2 className="font-display text-xl font-semibold text-ink">
              💰 Productos con precio anómalo
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Su precio mínimo es &gt;2.5× la mediana de su categoría. Posibles
              errores de import o productos premium mal categorizados.
            </p>
            <div className="mt-4 overflow-x-auto rounded-3xl border border-accent-wash bg-accent-wash/40">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b border-accent-wash bg-accent-wash text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink/70">Producto</th>
                    <th className="px-4 py-3 font-medium text-ink/70">Categoría</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Mín. producto</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Mediana cat.</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Multiplicador</th>
                  </tr>
                </thead>
                <tbody>
                  {overpriced.map((p) => (
                    <tr key={p.productId} className="border-b border-line/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/catalogo/${p.slug}`}
                          target="_blank"
                          className="font-medium text-ink hover:text-accent"
                        >
                          {p.name.slice(0, 60)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink/60">{p.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/80">
                        {EUR(p.minPriceCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/60">
                        {EUR(p.categoryMedianCents)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-full bg-accent-deep px-2 py-0.5 text-xs font-semibold text-bone">
                          {p.multiple}×
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── Búsquedas ─── */}
        <section className="mt-12" id="busquedas">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              🔍 Qué busca tu cliente (30 días)
            </h2>
            <Link
              href="/admin/insights/search-aliases"
              className="text-xs font-medium text-accent hover:underline"
            >
              Gestionar alias →
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Tracking de queries del buscador navbar. Las queries sin
            resultados son demanda real no cubierta.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-line bg-bone p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
                Top queries
              </p>
              {topSearches.length === 0 ? (
                <p className="mt-4 text-sm text-ink/55">
                  Sin búsquedas registradas aún.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {topSearches.slice(0, 10).map((s) => (
                    <li
                      key={s.query}
                      className="flex items-center justify-between gap-2 rounded-lg bg-bone-soft px-3 py-2"
                    >
                      <span className="truncate text-sm text-ink/80">{s.query}</span>
                      <span className="shrink-0 text-xs text-ink/55">
                        {s.count} búsq · {s.resultsAvg.toFixed(0)} resultados/avg
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-3xl border border-accent-wash bg-accent-wash p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-accent-deep">
                Buscan pero NO tienes 💎
              </p>
              {noResultSearches.length === 0 ? (
                <p className="mt-4 text-sm text-ink/55">
                  Sin queries fallidas. Tu catálogo cubre lo que buscan.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {noResultSearches.slice(0, 10).map((s) => (
                    <li
                      key={s.query}
                      className="flex items-center justify-between gap-2 rounded-lg bg-bone px-3 py-2"
                    >
                      <span className="truncate text-sm font-medium text-ink">
                        {s.query}
                      </span>
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-bone">
                        {s.count}×
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* ─── Heatmap horario ─── */}
        <section className="mt-12" id="heatmap">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              🗓️ Cuándo te visitan (mapa de calor)
            </h2>
            <div className="flex gap-1 rounded-full bg-bone-soft p-1 text-[11px]">
              <Link
                href="/admin/insights?heatmap=7d#heatmap"
                className={`rounded-full px-3 py-1 transition ${heatmapWindow === "7d" ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"}`}
              >
                7 días
              </Link>
              <Link
                href="/admin/insights?heatmap=30d#heatmap"
                className={`rounded-full px-3 py-1 transition ${heatmapWindow === "30d" ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"}`}
              >
                30 días
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Visitas a fichas de producto por día y hora (UTC). Útil para
            programar campañas o lanzamientos al momento óptimo.
          </p>
          <Heatmap cells={heatmap} />
        </section>

        {/* ─── Carmen ─── */}
        {carmen && (
          <section className="mt-12" id="carmen">
            <h2 className="font-display text-xl font-semibold text-ink">
              🎤 Carmen — agente de voz
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Conversaciones de voz con tu asistente IA (ElevenLabs). Útil para
              detectar qué te piden, qué herramientas falla más y cuánto cuesta.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Sesiones 30d"
                value={carmen.sessions30d.toLocaleString("es-ES")}
                hint={`${carmen.sessions7d} esta semana`}
              />
              <KpiCard
                label="Duración media"
                value={
                  carmen.avgDurationSec
                    ? `${Math.round(carmen.avgDurationSec)} s`
                    : "—"
                }
                hint="Tiempo de conversación promedio"
              />
              <KpiCard
                label="Sesiones a carrito"
                value={`${carmen.cartConversions30d}`}
                hint={
                  carmen.sessions30d > 0
                    ? `${Math.round((carmen.cartConversions30d / carmen.sessions30d) * 100)}% conv. voz → cotización`
                    : "—"
                }
                highlight={
                  carmen.cartConversions30d > 0 ? "success" : undefined
                }
              />
              <KpiCard
                label="Coste 30d"
                value={EUR(carmen.totalCostCents)}
                hint="ElevenLabs estimado"
              />
            </div>

            {(carmen.topProducts.length > 0 || carmen.topTools.length > 0) && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-line bg-bone p-5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
                    Top productos mencionados
                  </p>
                  {carmen.topProducts.length === 0 ? (
                    <p className="mt-3 text-sm text-ink/55">—</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {carmen.topProducts.map((p) => (
                        <li
                          key={p.slug}
                          className="flex items-center justify-between gap-2 rounded-lg bg-bone-soft px-3 py-2"
                        >
                          <Link
                            href={`/catalogo/${p.slug}`}
                            target="_blank"
                            className="truncate text-sm text-ink/80 hover:text-accent"
                          >
                            {p.slug}
                          </Link>
                          <span className="shrink-0 text-xs text-ink/55">
                            {p.mentions}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-3xl border border-line bg-bone p-5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
                    Top herramientas llamadas
                  </p>
                  {carmen.topTools.length === 0 ? (
                    <p className="mt-3 text-sm text-ink/55">—</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {carmen.topTools.map((t) => (
                        <li
                          key={t.tool}
                          className="flex items-center justify-between gap-2 rounded-lg bg-bone-soft px-3 py-2"
                        >
                          <span className="font-mono text-xs text-ink/80">
                            {t.tool}
                          </span>
                          <span className="shrink-0 text-xs text-ink/55">
                            {t.calls}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── Top productos ─── */}
        <section className="mt-12" id="top-productos">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">
              🔥 Top productos (últimos 30 días)
            </h2>
            <p className="text-xs text-ink/55">
              Total: {totalViews30d.toLocaleString("es-ES")} views · {totalCarts.toLocaleString("es-ES")} en carrito
            </p>
          </div>
          {top.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/60">
              Aún no hay datos de tracking. El sistema empieza a contar visitas
              desde este momento — vuelve mañana para ver el ranking.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="border-b border-line bg-bone-soft text-left">
                  <tr>
                    <th className="px-3 py-3 font-medium text-ink/70">#</th>
                    <th className="px-3 py-3 font-medium text-ink/70">Producto</th>
                    <th className="px-3 py-3 font-medium text-ink/70">Ref</th>
                    <th className="px-3 py-3 text-right font-medium text-ink/70">Views 30d</th>
                    <th className="px-3 py-3 text-right font-medium text-ink/70">Carrito</th>
                    <th className="px-3 py-3 text-right font-medium text-ink/70">Propuesta</th>
                    <th className="px-3 py-3 font-medium text-ink/70">Última visita</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={p.productId} className="border-b border-line/60 hover:bg-bone-soft">
                      <td className="px-3 py-3 text-xs text-ink/40">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/catalogo/${p.slug}`}
                          className="font-medium text-ink hover:text-accent"
                          target="_blank"
                        >
                          {p.name}
                        </Link>
                        {!p.primaryImageUrl && (
                          <span className="ml-2 rounded-full bg-accent-wash px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">
                            Sin imagen
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-ink/55">
                        {p.internalRef ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                        {p.view30d}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink/70">
                        {p.cartAddCount}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink/70">
                        {p.proposalCount}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink/55">
                        {fmtDate(p.lastViewedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminChrome>
  );
}
