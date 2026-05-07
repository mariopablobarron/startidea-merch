"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const EUR2 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

type BusinessData = {
  generatedAt: string;
  summary: {
    totalCarts: number;
    totalPayments: number;
    totalCustomers: number;
    activeProducts: number;
    pendingOrders: number;
    abandonedNow: number;
    revenueCents: number;
    avgTicketCents: number;
    conversionPctLast90: number;
  };
  revenueByMonth: Array<{ month: string; value: number }>;
  topProducts: {
    byUnits: Array<{ slug: string; name: string; units: number }>;
    byRevenue: Array<{ slug: string; name: string; revenueCents: number; units: number }>;
  };
  nps: {
    monthly: Array<{ month: string; value: number; raw?: { n: number } }>;
    avgOverall: number | null;
    totalReviews: number;
  };
  abandonedCart: { remindersSent: number; recovered: number; recoveryRatePct: number };
  broadcasts: { last30Days: { broadcasts: number; sent: number; failed: number } };
};

export default function BusinessAnalyticsPage() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics/business", { credentials: "include" });
      const d = await res.json();
      if (!res.ok) setError(d.error || "Error");
      else setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">
          ⚠ {error || "Sin datos"}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">Analytics</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Negocio</h1>
            <p className="mt-2 text-xs text-ink/50">
              KPIs de revenue, productos y NPS · Generado{" "}
              {new Date(data.generatedAt).toLocaleString("es-ES")}
            </p>
          </div>
          <nav className="flex gap-1.5 text-xs">
            <Link
              href="/admin/analytics"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Web (tráfico)
            </Link>
            <span className="rounded-full bg-accent px-3 py-1.5 font-semibold text-bone">
              Negocio
            </span>
          </nav>
        </header>

        {/* KPIs principales */}
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Ingresos totales"
            value={EUR.format(data.summary.revenueCents / 100)}
            color="text-social"
          />
          <Kpi
            label="Pedidos pagados"
            value={data.summary.totalPayments.toLocaleString("es-ES")}
            sub={`${data.summary.totalCarts.toLocaleString("es-ES")} carritos totales`}
          />
          <Kpi
            label="Ticket medio"
            value={data.summary.avgTicketCents > 0 ? EUR.format(data.summary.avgTicketCents / 100) : "—"}
          />
          <Kpi
            label="Conversión 90d"
            value={`${data.summary.conversionPctLast90}%`}
            color="text-accent"
            sub="cesta → pago"
          />
          <Kpi
            label="Clientes"
            value={data.summary.totalCustomers.toLocaleString("es-ES")}
            sub="con cuenta portal"
          />
          <Kpi
            label="Productos activos"
            value={data.summary.activeProducts.toLocaleString("es-ES")}
          />
          <Kpi
            label="En producción"
            value={data.summary.pendingOrders.toLocaleString("es-ES")}
            sub="pedidos ORDERED"
            color="text-accent"
          />
          <Kpi
            label="Abandonados ahora"
            value={data.summary.abandonedNow.toLocaleString("es-ES")}
            sub="en zona recovery"
            color="text-accent-deep"
          />
        </section>

        {/* Revenue por mes */}
        <section className="mb-8 rounded-2xl border border-line bg-bone p-5 lg:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Ingresos por mes (últimos 12)
            </h2>
            <p className="text-xs text-ink/50">€ totales pagados</p>
          </div>
          <BarChart
            data={data.revenueByMonth.map((d) => ({
              label: shortMonth(d.month),
              value: d.value / 100,
            }))}
            formatValue={(v) => EUR.format(v)}
          />
        </section>

        {/* Top productos */}
        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">
              Top productos por unidades
            </h2>
            {data.topProducts.byUnits.length === 0 ? (
              <p className="text-xs text-ink/50">Sin datos todavía</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {data.topProducts.byUnits.map((p, i) => (
                  <li key={p.slug} className="flex items-center gap-3">
                    <span className="w-5 text-xs font-medium tabular-nums text-ink/40">
                      {i + 1}
                    </span>
                    <Link
                      href={`/catalogo/${p.slug}`}
                      className="flex-1 truncate text-ink hover:text-accent"
                      target="_blank"
                    >
                      {p.name}
                    </Link>
                    <span className="font-medium tabular-nums text-accent">
                      {p.units.toLocaleString("es-ES")} uds
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">
              Top productos por ingresos
            </h2>
            {data.topProducts.byRevenue.length === 0 ? (
              <p className="text-xs text-ink/50">Sin datos todavía</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {data.topProducts.byRevenue.map((p, i) => (
                  <li key={p.slug} className="flex items-center gap-3">
                    <span className="w-5 text-xs font-medium tabular-nums text-ink/40">
                      {i + 1}
                    </span>
                    <Link
                      href={`/catalogo/${p.slug}`}
                      className="flex-1 truncate text-ink hover:text-accent"
                      target="_blank"
                    >
                      {p.name}
                    </Link>
                    <span className="text-right font-medium tabular-nums text-social">
                      {EUR2.format(p.revenueCents / 100)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* NPS + Abandoned + Broadcasts */}
        <section className="grid gap-6 lg:grid-cols-3">
          {/* NPS */}
          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-1 font-display text-base font-semibold text-ink">NPS</h2>
            <p className="text-xs text-ink/50">Net Promoter Score promedio mensual</p>
            <p className="mt-3 font-display text-4xl font-semibold tabular-nums text-social">
              {data.nps.avgOverall != null ? data.nps.avgOverall.toFixed(1) : "—"}
              <span className="ml-2 text-xs font-normal text-ink/40">/10</span>
            </p>
            <p className="mt-1 text-[11px] text-ink/50">
              {data.nps.totalReviews} valoraciones totales
            </p>
            <div className="mt-4">
              <BarChart
                data={data.nps.monthly.map((m) => ({
                  label: shortMonth(m.month),
                  value: m.value || 0,
                }))}
                formatValue={(v) => v.toFixed(1)}
                height={80}
                color="bg-social"
                maxScale={10}
              />
            </div>
          </div>

          {/* Abandoned */}
          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-1 font-display text-base font-semibold text-ink">
              Carritos abandonados
            </h2>
            <p className="text-xs text-ink/50">Recovery con drip + recordatorios</p>
            <div className="mt-3 space-y-2 text-sm">
              <Row
                label="Recordatorios enviados"
                value={data.abandonedCart.remindersSent.toLocaleString("es-ES")}
              />
              <Row
                label="Recuperados"
                value={data.abandonedCart.recovered.toLocaleString("es-ES")}
                strong
              />
              <Row
                label="Recovery rate"
                value={`${data.abandonedCart.recoveryRatePct}%`}
                strong
                color="text-social"
              />
              <Row
                label="Abandonados activos ahora"
                value={data.summary.abandonedNow.toLocaleString("es-ES")}
                color="text-accent"
              />
            </div>
            <Link
              href="/admin/cart-quotes/abandoned"
              className="mt-4 inline-block text-xs text-accent hover:underline"
            >
              Ver carritos abandonados →
            </Link>
          </div>

          {/* Broadcasts */}
          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-1 font-display text-base font-semibold text-ink">Email broadcasts</h2>
            <p className="text-xs text-ink/50">Últimos 30 días</p>
            <div className="mt-3 space-y-2 text-sm">
              <Row
                label="Broadcasts enviados"
                value={data.broadcasts.last30Days.broadcasts.toLocaleString("es-ES")}
              />
              <Row
                label="Emails entregados"
                value={data.broadcasts.last30Days.sent.toLocaleString("es-ES")}
                strong
                color="text-social"
              />
              <Row
                label="Fallos"
                value={data.broadcasts.last30Days.failed.toLocaleString("es-ES")}
                color={data.broadcasts.last30Days.failed > 0 ? "text-accent-deep" : ""}
              />
              <Row
                label="Tasa éxito"
                value={
                  data.broadcasts.last30Days.sent + data.broadcasts.last30Days.failed === 0
                    ? "—"
                    : `${(
                        (data.broadcasts.last30Days.sent /
                          (data.broadcasts.last30Days.sent + data.broadcasts.last30Days.failed)) *
                        100
                      ).toFixed(1)}%`
                }
                strong
              />
            </div>
            <Link
              href="/admin/marketing/broadcasts"
              className="mt-4 inline-block text-xs text-accent hover:underline"
            >
              Ver broadcasts →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
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
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${color || "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  color = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/60 pb-1.5 last:border-0">
      <span className="text-xs text-ink/60">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${color || "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function BarChart({
  data,
  formatValue,
  height = 140,
  color = "bg-accent",
  maxScale,
}: {
  data: Array<{ label: string; value: number }>;
  formatValue?: (v: number) => string;
  height?: number;
  color?: string;
  maxScale?: number;
}) {
  if (data.length === 0) return <p className="text-xs text-ink/40">Sin datos</p>;
  const max = maxScale ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const pct = max > 0 ? (d.value / max) * 100 : 0;
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className={`w-full rounded-t-md ${color} transition-opacity ${d.value > 0 ? "" : "opacity-20"}`}
                style={{ height: `${pct}%`, minHeight: d.value > 0 ? 2 : 4 }}
                title={formatValue ? formatValue(d.value) : String(d.value)}
              />
              {d.value > 0 && (
                <span className="pointer-events-none absolute -top-5 z-10 hidden whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[9px] font-medium text-bone opacity-0 transition group-hover:block group-hover:opacity-100">
                  {formatValue ? formatValue(d.value) : d.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-ink/40">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function shortMonth(yyyymm: string): string {
  // "2026-05" → "may'26"
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [y, m] = yyyymm.split("-");
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return yyyymm;
  return `${months[mi]}'${y.slice(2)}`;
}
