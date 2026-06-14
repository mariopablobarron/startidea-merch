"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CartQuoteListItem = {
  id: string;
  createdAt: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  status: string;
  estimatedTotalCents: number | null;
  itemsCount: number;
  paymentLinkSentAt: string | null;
};

type StatusSummary = { status: string; count: number; valueCents: number };

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const EUR0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Orden del embudo (de entrada a cierre). ARCHIVED/LOST al final.
const FUNNEL: { status: string; label: string }[] = [
  { status: "NEW", label: "Nuevas" },
  { status: "IN_PROGRESS", label: "En curso" },
  { status: "SENT", label: "Enviadas" },
  { status: "CONFIRMED", label: "Pagadas" },
  { status: "ORDERED", label: "En pedido" },
  { status: "LOST", label: "Perdidas" },
  { status: "ARCHIVED", label: "Archivadas" },
];

const STATUS_BADGE: Record<string, string> = {
  NEW: "bg-bone-soft text-ink/70",
  IN_PROGRESS: "bg-accent-mist text-accent-deep",
  SENT: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-social/20 text-social",
  ORDERED: "bg-social/20 text-social",
  LOST: "bg-accent-wash text-accent-deep",
  ARCHIVED: "bg-ink/5 text-ink/40",
};

const DAY = 24 * 60 * 60 * 1000;

export default function AdminCartQuotesPage() {
  const [items, setItems] = useState<CartQuoteListItem[]>([]);
  const [summary, setSummary] = useState<StatusSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingCookie, setUsingCookie] = useState(true);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (secret) headers["X-Admin-Secret"] = secret;
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/cart-quotes${qs}`, { headers, credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setUsingCookie(false);
        setError(secret ? data.error || "Error" : null);
        setItems([]);
      } else {
        setItems(data.items || []);
        setSummary(data.summary || []);
        if (secret) sessionStorage.setItem("merch:admin", secret);
        setUsingCookie(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, statusFilter]);

  const sumOf = (status: string) => summary.find((s) => s.status === status);
  const now = Date.now();

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Admin · Cotizaciones</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Embudo de cotizaciones</h1>
            <p className="mt-1 text-sm text-ink/60">Persigue lo que está en movimiento. Pulsa un estado para filtrar.</p>
          </div>
          {!usingCookie && (
            <input
              type="password"
              placeholder="X-Admin-Secret (legacy)"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-72 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
        </header>

        {/* Embudo: conteo + valor por estado, clicable para filtrar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {FUNNEL.map((f) => {
            const s = sumOf(f.status);
            const active = statusFilter === f.status;
            return (
              <button
                key={f.status}
                type="button"
                onClick={() => setStatusFilter(active ? null : f.status)}
                className={`rounded-2xl border p-3 text-left transition ${
                  active ? "border-accent bg-accent/5" : "border-line bg-bone hover:border-accent/50"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider text-ink/50">{f.label}</p>
                <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-ink">{s?.count ?? 0}</p>
                <p className="text-[11px] text-ink/55">{EUR0.format((s?.valueCents ?? 0) / 100)}</p>
              </button>
            );
          })}
        </div>

        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="mb-4 text-xs text-accent hover:underline"
          >
            ← Quitar filtro ({statusFilter})
          </button>
        )}

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        {loading && <p className="text-sm text-ink/60">Cargando…</p>}

        <div className="overflow-hidden rounded-3xl border border-line bg-bone">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft">
              <tr>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th className="text-center">Items</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-center">Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-ink/60">
                    No hay cotizaciones {statusFilter ? `en estado ${statusFilter}` : "todavía"}.
                  </td>
                </tr>
              )}
              {items.map((it) => {
                // Antigüedad de cotizaciones enviadas sin pagar (riesgo de enfriarse).
                let aging: { days: number; cold: boolean } | null = null;
                if (it.status === "SENT" && it.paymentLinkSentAt) {
                  const days = Math.floor((now - new Date(it.paymentLinkSentAt).getTime()) / DAY);
                  aging = { days, cold: days >= 5 };
                }
                return (
                  <tr key={it.id} className="border-t border-line hover:bg-bone-soft">
                    <Td>
                      <span className="text-xs text-ink/60">
                        {new Date(it.createdAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </Td>
                    <Td>
                      <p className="font-medium text-ink">{it.name}</p>
                      {it.company && <p className="text-xs text-ink/60">{it.company}</p>}
                      <p className="text-xs text-ink/50">{it.email}</p>
                    </Td>
                    <Td className="text-center tabular-nums">{it.itemsCount}</Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {it.estimatedTotalCents != null ? EUR.format(it.estimatedTotalCents / 100) : "—"}
                    </Td>
                    <Td className="text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${STATUS_BADGE[it.status] || "bg-bone-soft text-ink/70"}`}>
                        {it.status}
                      </span>
                      {aging && (
                        <p className={`mt-1 text-[10px] ${aging.cold ? "font-semibold text-accent-deep" : "text-ink/45"}`}>
                          {aging.cold ? "⏳ " : ""}
                          {aging.days === 0 ? "enviado hoy" : `${aging.days}d sin pagar`}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/cart-quotes/${it.id}`}
                        className="text-xs font-medium text-accent hover:text-accent-dark"
                      >
                        Ver →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50 ${className || ""}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className || ""}`}>{children}</td>;
}
