/**
 * /share/dashboard/[token] — Vista pública read-only del dashboard.
 *
 * Sin auth admin. Token HMAC firmado por el admin (genera en
 * /admin/insights/integrations o /api/admin/insights/share-url).
 *
 * Scope:
 *   - summary: solo KPIs principales (funnel + salud)
 *   - full: + top productos + categorías
 *
 * NO incluye: acciones one-click, secrets, error tracking, alias.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyShareToken } from "@/lib/dashboard-share";
import {
  getCatalogHealth,
  getConversionFunnel,
  getTopViewedProducts,
  getTopCategories,
} from "@/lib/insights";

export const metadata: Metadata = {
  title: "TodoMerchandising · Snapshot",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

function KpiCard({
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
        accent
          ? "bg-ink text-bone"
          : "border border-line bg-bone"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${
          accent ? "text-bone/60" : "text-ink/60"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {hint && (
        <p
          className={`mt-1 text-xs ${
            accent ? "text-bone/65" : "text-ink/55"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function SharedDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyShareToken(token);
  if (!verified.valid) {
    notFound();
  }
  const { scope } = verified;

  const [health, funnel, top, categories] = await Promise.all([
    getCatalogHealth(),
    getConversionFunnel(),
    scope === "full" ? getTopViewedProducts(8, "30d") : Promise.resolve([]),
    scope === "full" ? getTopCategories(6) : Promise.resolve([]),
  ]);

  const expiryDate = new Date(verified.expiry * 1000);

  return (
    <main className="min-h-screen bg-bone-soft px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/55">
              TodoMerchandising · Startidea Málaga SL
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink lg:text-4xl">
              Snapshot · {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </h1>
            <p className="mt-1 text-sm text-ink/55">
              Datos de los últimos 30 días.{" "}
              <span className="text-ink/40">
                Vista compartida {scope === "full" ? "completa" : "resumida"} válida hasta {expiryDate.toLocaleDateString("es-ES")}.
              </span>
            </p>
          </div>
        </header>

        {/* Funnel */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold text-ink">
            Conversión 30 días
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Views catálogo"
              value={funnel.views30d.toLocaleString("es-ES")}
              hint={
                funnel.views30dDelta !== 0
                  ? `${funnel.views30dDelta > 0 ? "▲" : "▼"} ${Math.abs(funnel.views30dDelta).toFixed(0)}% vs 30d previos`
                  : "Visitas únicas a fichas"
              }
            />
            <KpiCard
              label="Añadidos a carrito"
              value={funnel.cartAdds30d.toLocaleString("es-ES")}
              hint={`${funnel.cartConvPct}% conv views → cart`}
            />
            <KpiCard
              label="Consultas recomendador"
              value={funnel.recommenderQueries30d.toLocaleString("es-ES")}
              hint="Briefs procesados por IA"
            />
            <KpiCard
              label="Propuestas enviadas"
              value={funnel.proposals30d.toLocaleString("es-ES")}
              hint={`${funnel.proposalConvPct}% conv cart → propuesta`}
              accent
            />
          </div>
        </section>

        {/* Salud catálogo */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold text-ink">
            Salud del catálogo
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Productos activos"
              value={health.activeProducts.toLocaleString("es-ES")}
              hint={`${health.totalProducts.toLocaleString("es-ES")} en BD total`}
            />
            <KpiCard
              label="Variantes / SKUs"
              value={health.totalVariants.toLocaleString("es-ES")}
              hint="100% con precio"
            />
            <KpiCard
              label="% con stock"
              value={`${health.pctStock}%`}
              hint={`${health.variantsWithStock.toLocaleString("es-ES")} variantes`}
            />
            <KpiCard
              label="% con imagen"
              value={`${health.pctImage}%`}
              hint={`${health.productsWithImage.toLocaleString("es-ES")} de ${health.activeProducts.toLocaleString("es-ES")}`}
            />
          </div>
        </section>

        {/* Top productos solo si scope=full */}
        {scope === "full" && top.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-semibold text-ink">
              Top productos (30 días)
            </h2>
            <ul className="mt-4 space-y-2">
              {top.map((p, i) => (
                <li
                  key={p.productId}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-bone px-4 py-3"
                >
                  <span className="font-mono text-xs text-ink/40">{i + 1}.</span>
                  <span className="flex-1 truncate text-sm font-medium text-ink">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink/55">
                    {p.view30d}v · {p.cartAddCount} cart
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Categorías solo si scope=full */}
        {scope === "full" && categories.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-semibold text-ink">
              Categorías por engagement
            </h2>
            <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b border-line bg-bone-soft text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink/70">Categoría</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Productos</th>
                    <th className="px-4 py-3 text-right font-medium text-ink/70">Views 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.categoryId ?? "none"} className="border-b border-line/60">
                      <td className="px-4 py-3 font-medium text-ink">{c.categoryName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/70">{c.products}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{c.views30d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="mt-12 rounded-3xl border border-line bg-bone p-6 text-center text-xs text-ink/55">
          Datos en tiempo real generados por TodoMerchandising. Esta vista es
          solo lectura — para ver el panel completo, accede como administrador.
        </footer>
      </div>
    </main>
  );
}
