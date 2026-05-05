"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPushPanel } from "@/components/AdminPushPanel";

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
  maximumFractionDigits: 2,
});

type Dashboard = {
  ok: true;
  generatedAt: string;
  counts: {
    carts: { total: number; thisMonth: number; last30: number; last90: number };
    products: number;
    payments: { total: number; thisMonth: number };
    quoteRequests: { thisMonth: number };
  };
  revenueCents: {
    paidTotal: number;
    paidThisMonth: number;
    acceptedLast90: number;
    estimatedLast90: number;
  };
  funnel: Record<string, { count: number; estimated: number; accepted: number }>;
  conversionPct: number;
  staleCarts: Array<{
    id: string;
    name: string;
    company: string | null;
    email: string;
    status: string;
    createdAt: string;
    estimatedTotalCents: number | null;
  }>;
  recentCarts: Array<{
    id: string;
    name: string;
    company: string | null;
    email: string;
    status: string;
    createdAt: string;
    estimatedTotalCents: number | null;
    acceptedTotalCents: number | null;
  }>;
  topItems: Array<{
    productSlug: string;
    productName: string;
    timesQuoted: number;
    unitsQuoted: number;
    revenueCents: number;
  }>;
};

export default function AdminDashboardPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  useEffect(() => {
    if (!secret) return;
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/dashboard", { headers: { "X-Admin-Secret": secret } });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json.error || "Error");
        else {
          setData(json);
          sessionStorage.setItem("merch:admin", secret);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 60_000); // auto-refresh 60s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [secret]);

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">Admin</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Panel general</h1>
            {data && (
              <p className="mt-1 text-xs text-ink/50">
                Actualizado {new Date(data.generatedAt).toLocaleTimeString("es-ES")} · auto-refresh 60s
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex gap-2 text-xs">
              <Link href="/admin/cart-quotes" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Carritos
              </Link>
              <Link href="/admin/quotes" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Cotizaciones
              </Link>
            </nav>
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
        {!data && loading && <p className="text-sm text-ink/60">Cargando KPIs…</p>}
        {!data && !secret && (
          <p className="text-sm text-ink/60">Pega tu X-Admin-Secret arriba para ver el dashboard.</p>
        )}

        {data && (
          <>
            {/* Tarjetas KPI top */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Cotizaciones este mes"
                value={data.counts.carts.thisMonth.toString()}
                sub={`${data.counts.carts.last30} últimos 30 días · ${data.counts.carts.total} histórico`}
                href="/admin/cart-quotes"
              />
              <Kpi
                label="Cobrado este mes"
                value={EUR.format(data.revenueCents.paidThisMonth / 100)}
                sub={`${data.counts.payments.thisMonth} pagos · ${EUR.format(data.revenueCents.paidTotal / 100)} histórico`}
                color="social"
              />
              <Kpi
                label="Aceptado últimos 90d"
                value={EUR.format(data.revenueCents.acceptedLast90 / 100)}
                sub={`${EUR.format(data.revenueCents.estimatedLast90 / 100)} estimado en cesta`}
              />
              <Kpi
                label="Conversión"
                value={`${data.conversionPct}%`}
                sub="cesta → pedido confirmado"
                color="accent"
              />
            </section>

            {/* Embudo */}
            <section className="mt-10">
              <h2 className="mb-4 font-display text-xl font-semibold text-ink">Embudo de cotizaciones</h2>
              <FunnelBar funnel={data.funnel} />
            </section>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {/* Stale */}
              <section className="rounded-3xl border border-line bg-bone p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Pendientes de revisar (más de 24h)
                  </h2>
                  <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-[11px] font-medium text-accent-deep">
                    {data.staleCarts.length}
                  </span>
                </div>
                {data.staleCarts.length === 0 ? (
                  <p className="mt-4 text-sm text-ink/60">¡Bien! Todo está al día.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm">
                    {data.staleCarts.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/admin/cart-quotes/${c.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-bone-soft"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {c.name}{c.company && <span className="text-ink/60"> · {c.company}</span>}
                            </p>
                            <p className="truncate text-[11px] text-ink/50">
                              {c.email} · {Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 3.6e6)}h sin tocar
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {c.estimatedTotalCents != null ? EUR2.format(c.estimatedTotalCents / 100) : "—"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Top productos */}
              <section className="rounded-3xl border border-line bg-bone p-5">
                <h2 className="font-display text-lg font-semibold text-ink">
                  Top productos cotizados
                </h2>
                {data.topItems.length === 0 ? (
                  <p className="mt-4 text-sm text-ink/60">Aún no hay datos.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm">
                    {data.topItems.map((it) => (
                      <li key={it.productSlug}>
                        <Link
                          href={`/catalogo/${it.productSlug}`}
                          className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-bone-soft"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{it.productName}</p>
                            <p className="text-[11px] text-ink/50">
                              {it.timesQuoted} cotizaciones · {it.unitsQuoted.toLocaleString("es-ES")} uds
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {EUR.format(it.revenueCents / 100)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Recientes */}
            <section className="mt-6 rounded-3xl border border-line bg-bone p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Últimos carritos recibidos</h2>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink/50">
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 text-center font-medium">Estado</th>
                    <th className="pb-2 text-right font-medium">Estimado</th>
                    <th className="pb-2 text-right font-medium">Aceptado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCarts.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-2 pr-2 text-xs text-ink/60">
                        {new Date(c.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 pr-2">
                        <Link href={`/admin/cart-quotes/${c.id}`} className="font-medium text-ink hover:text-accent">
                          {c.name}
                        </Link>
                        {c.company && <span className="text-xs text-ink/50"> · {c.company}</span>}
                      </td>
                      <td className="py-2 text-center">
                        <span className="rounded-full bg-bone-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/70">
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink/70">
                        {c.estimatedTotalCents != null ? EUR2.format(c.estimatedTotalCents / 100) : "—"}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {c.acceptedTotalCents != null ? EUR2.format(c.acceptedTotalCents / 100) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="mt-6">
              <AdminPushPanel secret={secret} />
            </div>

            <p className="mt-8 text-center text-[11px] text-ink/40">
              Catálogo activo: {data.counts.products.toLocaleString("es-ES")} productos.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  href,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  color?: "accent" | "social";
}) {
  const card = (
    <div
      className={`rounded-3xl border bg-bone p-6 transition ${
        href ? "border-line hover:border-accent" : "border-line"
      }`}
    >
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
  return href ? <Link href={href}>{card}</Link> : card;
}

function FunnelBar({
  funnel,
}: {
  funnel: Record<string, { count: number; estimated: number; accepted: number }>;
}) {
  const order: Array<{ key: string; label: string }> = [
    { key: "NEW", label: "Recibido" },
    { key: "IN_PROGRESS", label: "Revisando" },
    { key: "SENT", label: "Enviada" },
    { key: "CONFIRMED", label: "Confirmada" },
    { key: "ORDERED", label: "Pedida" },
    { key: "ARCHIVED", label: "Archivada" },
  ];
  const max = Math.max(...order.map((o) => funnel[o.key]?.count || 0), 1);
  return (
    <div className="space-y-2">
      {order.map((o) => {
        const f = funnel[o.key] || { count: 0, estimated: 0, accepted: 0 };
        const width = Math.max(4, (f.count / max) * 100);
        const barClass =
          o.key === "ORDERED"
            ? "bg-social text-bone"
            : o.key === "CONFIRMED"
              ? "bg-social/40 text-ink"
              : o.key === "NEW"
                ? "bg-accent text-bone"
                : "bg-ink/10 text-ink";
        return (
          <div key={o.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-right text-xs uppercase tracking-wider text-ink/60">
              {o.label}
            </span>
            <div className="flex-1">
              <div
                className={`flex h-7 items-center rounded-full px-3 text-xs font-medium tabular-nums ${barClass}`}
                style={{ width: `${width}%` }}
              >
                {f.count} {f.count === 1 ? "carrito" : "carritos"}
              </div>
            </div>
            <span className="w-32 shrink-0 text-right text-xs tabular-nums text-ink/60">
              {EUR.format((f.accepted || f.estimated) / 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
