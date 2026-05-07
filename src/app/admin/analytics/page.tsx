"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type AnalyticsData = {
  range: { days: number; since: string };
  summary: {
    totalEvents: number;
    totalPageviews: number;
    uniqueSessions: number;
    addsToCart: number;
    payClicks: number;
    cartCount: number;
    paymentCount: number;
    paidCents: number;
    productCountActive: number;
  };
  funnel: { pageviews: number; addToCart: number; cartQuote: number; payClick: number; paid: number };
  eventsByType: { type: string; count: number }[];
  pageviewsByPath: { path: string; count: number }[];
  topProducts: { slug: string; name: string; ref: string; views: number }[];
  eventsByDay: { day: string; count: number }[];
};

export default function AdminAnalyticsPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  useEffect(() => {
    if (!secret) return;
    fetch(`/api/admin/analytics?days=${days}`, { headers: { "X-Admin-Secret": secret } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          sessionStorage.setItem("merch:admin", secret);
          setError(null);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error de red"));
  }, [secret, days]);

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin" className="text-xs text-ink/60 hover:text-accent">
              ← Panel general
            </Link>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Analytics</h1>
            {data && (
              <p className="mt-1 text-xs text-ink/50">
                Últimos {data.range.days} días — desde {new Date(data.range.since).toLocaleDateString("es-ES")}
              </p>
            )}
            <nav className="mt-3 flex gap-1.5 text-xs">
              <span className="rounded-full bg-accent px-3 py-1.5 font-semibold text-bone">
                Web (tráfico)
              </span>
              <Link
                href="/admin/analytics/business"
                className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              >
                Negocio
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs"
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
              <option value={180}>180 días</option>
            </select>
            <input
              type="password"
              placeholder="X-Admin-Secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-72 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </header>

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        {!data && !error && secret && <p className="text-sm text-ink/60">Cargando…</p>}

        {data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Pageviews" value={data.summary.totalPageviews.toLocaleString("es-ES")} sub={`${data.summary.uniqueSessions} sesiones únicas`} />
              <Kpi label="Add to cart" value={data.summary.addsToCart.toLocaleString("es-ES")} sub={`${pct(data.summary.addsToCart, data.summary.totalPageviews)} de pageviews`} color="accent" />
              <Kpi label="Cotizaciones" value={data.summary.cartCount.toLocaleString("es-ES")} sub={`${pct(data.summary.cartCount, data.summary.addsToCart)} de adds`} />
              <Kpi label="Pagos cobrados" value={data.summary.paymentCount.toLocaleString("es-ES")} sub={EUR.format(data.summary.paidCents / 100)} color="social" />
            </section>

            {/* Funnel */}
            <section className="mt-8 rounded-3xl border border-line bg-bone p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Embudo completo</h2>
              <div className="mt-5 space-y-2">
                <FunnelStep label="1. Pageview" value={data.funnel.pageviews} max={data.funnel.pageviews} />
                <FunnelStep label="2. Add to cart" value={data.funnel.addToCart} max={data.funnel.pageviews} prev={data.funnel.pageviews} />
                <FunnelStep label="3. Cotización enviada" value={data.funnel.cartQuote} max={data.funnel.pageviews} prev={data.funnel.addToCart} />
                <FunnelStep label="4. Pago iniciado" value={data.funnel.payClick} max={data.funnel.pageviews} prev={data.funnel.cartQuote} />
                <FunnelStep label="5. Pago completado" value={data.funnel.paid} max={data.funnel.pageviews} prev={data.funnel.payClick} highlight />
              </div>
            </section>

            {/* Línea temporal */}
            {data.eventsByDay.length > 0 && (
              <section className="mt-6 rounded-3xl border border-line bg-bone p-6">
                <h2 className="font-display text-lg font-semibold text-ink">Pageviews por día</h2>
                <Sparkline data={data.eventsByDay} />
              </section>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Top productos vistos */}
              <section className="rounded-3xl border border-line bg-bone p-5">
                <h2 className="font-display text-lg font-semibold text-ink">Productos más vistos</h2>
                {data.topProducts.length === 0 ? (
                  <p className="mt-4 text-sm text-ink/60">Sin datos.</p>
                ) : (
                  <ol className="mt-4 space-y-2 text-sm">
                    {data.topProducts.map((p, i) => (
                      <li key={p.slug}>
                        <Link
                          href={`/catalogo/${p.slug}`}
                          className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-bone-soft"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="w-5 text-xs tabular-nums text-ink/40">{i + 1}.</span>
                            <span className="min-w-0">
                              <p className="truncate font-medium text-ink">{p.name}</p>
                              {p.ref && <p className="text-[11px] text-ink/50">Ref. {p.ref}</p>}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {p.views.toLocaleString("es-ES")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Top paths */}
              <section className="rounded-3xl border border-line bg-bone p-5">
                <h2 className="font-display text-lg font-semibold text-ink">Páginas más visitadas</h2>
                {data.pageviewsByPath.length === 0 ? (
                  <p className="mt-4 text-sm text-ink/60">Sin datos.</p>
                ) : (
                  <ul className="mt-4 space-y-1 text-sm">
                    {data.pageviewsByPath.map((p) => (
                      <li key={p.path} className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-bone-soft">
                        <span className="truncate font-mono text-xs text-ink/70">{p.path}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {p.count.toLocaleString("es-ES")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Eventos por tipo */}
            <section className="mt-6 rounded-3xl border border-line bg-bone p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Eventos por tipo</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.eventsByType.map((e) => (
                  <div key={e.type} className="rounded-2xl bg-bone-soft p-4">
                    <p className="font-display text-2xl font-semibold tabular-nums text-ink">
                      {e.count.toLocaleString("es-ES")}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-ink/60">{e.type}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function pct(num: number, den: number): string {
  if (!den) return "—";
  const v = (num / den) * 100;
  return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "accent" | "social";
}) {
  return (
    <div className="rounded-3xl border border-line bg-bone p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50">{label}</p>
      <p
        className={`mt-3 font-display text-3xl font-semibold tabular-nums ${
          color === "accent" ? "text-accent" : color === "social" ? "text-social" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-ink/60">{sub}</p>}
    </div>
  );
}

function FunnelStep({
  label,
  value,
  max,
  prev,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  prev?: number;
  highlight?: boolean;
}) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  const conv = prev != null && prev > 0 ? ((value / prev) * 100).toFixed(1) + "%" : null;
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-right text-xs uppercase tracking-wider text-ink/60">
        {label}
      </span>
      <div className="flex-1">
        <div
          className={`flex h-7 items-center rounded-full px-3 text-xs font-medium tabular-nums ${
            highlight ? "bg-social text-bone" : "bg-accent text-bone"
          }`}
          style={{ width: `${width}%`, minWidth: "60px" }}
        >
          {value.toLocaleString("es-ES")}
        </div>
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-ink/50">{conv}</span>
    </div>
  );
}

function Sparkline({ data }: { data: { day: string; count: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="mt-4 flex h-32 items-end gap-1">
      {data.map((d) => {
        const h = (d.count / max) * 100;
        return (
          <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-lg bg-accent transition group-hover:bg-accent-dark"
              style={{ height: `${h}%`, minHeight: "2px" }}
              title={`${d.day} · ${d.count} pageviews`}
            />
            <span className="text-[8px] text-ink/40">
              {new Date(d.day).getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
