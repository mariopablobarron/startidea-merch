"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPushPanel } from "@/components/AdminPushPanel";
import { StatCard } from "@/components/admin/StatCard";
import { DailyWorkPanel } from "@/components/admin/DailyWorkPanel";

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
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  // Cookie-first: la sesión nueva (Sprint 23) viaja en la cookie merch_admin HttpOnly.
  // Si está, /api/admin/dashboard responde sin necesidad de X-Admin-Secret.
  // Caemos a sessionStorage solo como fallback legacy.
  const [usingCookie, setUsingCookie] = useState(true);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (secret) headers["X-Admin-Secret"] = secret;
        const res = await fetch("/api/admin/dashboard", { headers, credentials: "include" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setUsingCookie(false);
            setData(null);
            setError("Inicia sesión para consultar las cotizaciones.");
          } else {
            setError("No se han podido cargar las cotizaciones. Inténtalo de nuevo.");
          }
        } else {
          setData(json);
          if (secret) sessionStorage.setItem("merch:admin", secret);
          setError(null);
          setUsingCookie(true);
        }
      } catch {
        if (alive) setError("No se ha podido conectar con el panel. Comprueba la conexión y reintenta.");
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
  }, [secret, refreshVersion]);

  return (
    <main className="min-h-screen min-w-0 bg-bone-soft px-4 py-6 sm:p-8">
      <div className="mx-auto min-w-0 max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Admin</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Panel general</h1>
            {data && (
              <p className="mt-2 text-base text-ink/70">Se actualiza cada minuto.</p>
            )}
          </div>
          <div className="w-full min-w-0">
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-bone px-4 py-3 text-base font-medium text-ink transition-colors duration-150 hover:border-ink/40 active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-deep">
                Más herramientas <span aria-hidden="true" className="ml-3 group-open:rotate-180">⌄</span>
              </summary>
            <nav aria-label="Todas las herramientas" className="mt-3 flex min-w-0 flex-wrap gap-2 text-base [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:px-4 [&_a]:py-3 [&_a]:transition-colors [&_a]:duration-150 [&_a:active]:bg-line [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-accent-deep">
              <Link href="/admin/cotizar" className="rounded-full bg-social px-3 py-1.5 font-medium text-bone hover:opacity-90">
                💸 Cotizar
              </Link>
              <Link href="/admin/products" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                🔎 Productos
              </Link>
              <Link href="/admin/cart-quotes" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Carritos
              </Link>
              <Link href="/admin/orders" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                📦 Pedidos
              </Link>
              <Link href="/admin/quotes" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Cotizaciones
              </Link>
              <Link href="/admin/analytics" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Analytics
              </Link>
              <Link href="/admin/coupons" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                Cupones
              </Link>
              <Link href="/admin/suppliers/midocean" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                🔌 MidOcean
              </Link>
              <Link href="/admin/suppliers/makito" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                🔌 Makito
              </Link>
              <Link href="/admin/suppliers/cifra" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                🔌 Cifra
              </Link>
              <Link href="/admin/team" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
                👥 Equipo
              </Link>
              <Link href="/admin/proposals/new" className="rounded-full bg-accent px-3 py-1.5 text-bone hover:bg-accent-dark">
                ⚡ Nueva propuesta IA
              </Link>
            </nav>
            </details>
            {!usingCookie && (
              <label className="mt-4 block text-base text-ink/75">
                Acceso heredado
                <input
                  type="password"
                  placeholder="X-Admin-Secret (legacy)"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="mt-2 block min-h-11 w-full max-w-sm rounded-xl border border-line bg-bone px-3 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep"
                />
              </label>
            )}
          </div>
        </header>

        <DailyWorkPanel
          data={data}
          loading={loading}
          error={error}
          loginRequired={!usingCookie && !secret}
          onRetry={() => setRefreshVersion((value) => value + 1)}
        />

        {data && (
          <>
            {/* Tarjetas KPI top */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/admin/cart-quotes" className="block transition hover:opacity-90">
                <StatCard
                  label="Cotizaciones este mes"
                  value={data.counts.carts.thisMonth.toString()}
                  hint={`${data.counts.carts.last30} últimos 30 días · ${data.counts.carts.total} histórico`}
                />
              </Link>
              <StatCard
                label="Cobrado este mes"
                value={EUR.format(data.revenueCents.paidThisMonth / 100)}
                hint={`${data.counts.payments.thisMonth} pagos · ${EUR.format(data.revenueCents.paidTotal / 100)} histórico`}
                tone="social"
              />
              <StatCard
                label="Aceptado últimos 90d"
                value={EUR.format(data.revenueCents.acceptedLast90 / 100)}
                hint={`${EUR.format(data.revenueCents.estimatedLast90 / 100)} estimado en cesta`}
              />
              <StatCard
                label="Conversión"
                value={`${data.conversionPct}%`}
                hint="cesta → pedido confirmado"
                tone="accent"
              />
            </section>

            {/* Embudo */}
            <section className="mt-10">
              <h2 className="mb-4 font-display text-xl font-semibold text-ink">Embudo de cotizaciones</h2>
              <FunnelBar funnel={data.funnel} />
            </section>

            <div className="mt-10">
              {/* Top productos */}
              <section className="rounded-3xl border border-line bg-bone p-5">
                <h2 className="font-display text-lg font-semibold text-ink">
                  Top productos cotizados
                </h2>
                {data.topItems.length === 0 ? (
                  <p className="mt-4 text-base text-ink/75">Aún no hay datos.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-base">
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
              <div className="mt-4 overflow-x-auto rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-deep" role="region" aria-label="Últimos carritos, tabla desplazable" tabIndex={0}>
              <table className="w-full min-w-[640px] text-base">
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
              </div>
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
          <div key={o.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)_8rem]">
            <span className="text-base text-ink/75 sm:text-right">
              {o.label}
            </span>
            <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
              <div
                className={`flex min-h-8 min-w-fit items-center whitespace-nowrap rounded-full px-3 py-1 text-base font-medium tabular-nums ${barClass}`}
                style={{ width: `${width}%` }}
              >
                {f.count} {f.count === 1 ? "carrito" : "carritos"}
              </div>
            </div>
            <span className="col-start-2 row-start-1 text-right text-base tabular-nums text-ink/75 sm:col-start-3">
              {EUR.format((f.accepted || f.estimated) / 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
