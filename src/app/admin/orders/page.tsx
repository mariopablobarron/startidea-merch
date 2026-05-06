"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Stage =
  | "RECEIVED"
  | "REVIEWING"
  | "QUOTE_SENT"
  | "PAID"
  | "PROOF_PENDING"
  | "PROOF_APPROVED"
  | "IN_PRODUCTION"
  | "SHIPPED"
  | "DELIVERED"
  | "ARCHIVED";

type Order = {
  id: string;
  createdAt: string;
  orderedAt: string | null;
  confirmedAt: string | null;
  name: string;
  company: string | null;
  email: string;
  status: string;
  stage: Stage;
  itemsCount: number;
  unitsCount: number;
  topItems: string[];
  midoceanOrderId: string | null;
  midoceanOrderStatus: string | null;
  proofStatus: string | null;
  tracking: { status?: string; code?: string; carrier?: string; url?: string; fetchedAt?: string } | null;
  paidCents: number;
  acceptedTotalCents: number | null;
  daysOrdered: number | null;
  deadline: string | null;
};

const STAGES: { key: Stage; label: string; emoji: string }[] = [
  { key: "RECEIVED", label: "Recibido", emoji: "📥" },
  { key: "REVIEWING", label: "Revisando", emoji: "👀" },
  { key: "QUOTE_SENT", label: "Cotización enviada", emoji: "📤" },
  { key: "PAID", label: "Pago recibido", emoji: "💰" },
  { key: "PROOF_PENDING", label: "Mockup esperando", emoji: "🎨" },
  { key: "PROOF_APPROVED", label: "Mockup aprobado", emoji: "✓" },
  { key: "IN_PRODUCTION", label: "En producción", emoji: "🏭" },
  { key: "SHIPPED", label: "Enviado", emoji: "🚚" },
  { key: "DELIVERED", label: "Entregado", emoji: "📦" },
  { key: "ARCHIVED", label: "Archivado", emoji: "🗄" },
];

const STAGE_COLOR: Record<Stage, string> = {
  RECEIVED: "bg-bone-soft text-ink/70",
  REVIEWING: "bg-bone-soft text-ink/70",
  QUOTE_SENT: "bg-accent-mist text-accent-deep",
  PAID: "bg-accent/15 text-accent-deep",
  PROOF_PENDING: "bg-accent-wash text-accent-deep",
  PROOF_APPROVED: "bg-accent/20 text-accent-deep",
  IN_PRODUCTION: "bg-accent text-bone",
  SHIPPED: "bg-social/30 text-social-dark",
  DELIVERED: "bg-social text-bone",
  ARCHIVED: "bg-line/40 text-ink/40",
};

export default function AdminOrdersPage() {
  const [secret, setSecret] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "stale">("active");
  const [data, setData] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  async function load() {
    if (!secret) return;
    const res = await fetch(`/api/admin/orders?filter=${filter}`, { headers: { "X-Admin-Secret": secret } });
    const json = await res.json();
    if (!res.ok) setError(json.error);
    else {
      setData(json.items || []);
      sessionStorage.setItem("merch:admin", secret);
      setError(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, filter]);

  async function refreshTracking(id: string) {
    setRefreshing(id);
    try {
      await fetch(`/api/admin/cart-quotes/${id}/tracking`, { headers: { "X-Admin-Secret": secret } });
      await load();
    } finally {
      setRefreshing(null);
    }
  }

  const counts = {
    active: data.length,
    stale: data.filter((o) => o.daysOrdered != null && o.daysOrdered > 14).length,
  };

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-2"><Link href="/admin" className="text-xs text-ink/60 hover:text-accent">← Panel</Link></div>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Pedidos en producción</h1>
            <p className="mt-1 text-sm text-ink/60">
              Vista unificada del estado real de cada pedido. Cruza estado interno + proof + tracking MidOcean.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-full border border-line bg-bone p-1 text-xs">
              {(["active", "stale", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 transition ${
                    filter === f ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {f === "active" ? "Activos" : f === "stale" ? "Lentos (>14d)" : "Todos"}
                </button>
              ))}
            </div>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="X-Admin-Secret"
              className="w-64 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </header>

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}

        {data.length === 0 && (
          <div className="rounded-3xl border border-dashed border-line bg-bone p-12 text-center text-ink/60">
            No hay pedidos {filter === "active" ? "activos" : filter === "stale" ? "lentos" : ""} todavía.
          </div>
        )}

        <div className="space-y-3">
          {data.map((o) => (
            <article key={o.id} className="rounded-2xl border border-line bg-bone p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/cart-quotes/${o.id}`} className="font-display text-lg font-semibold text-ink hover:text-accent">
                      {o.name}
                    </Link>
                    {o.company && <span className="text-sm text-ink/60">· {o.company}</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STAGE_COLOR[o.stage]}`}>
                      {STAGES.find((s) => s.key === o.stage)?.emoji} {STAGES.find((s) => s.key === o.stage)?.label}
                    </span>
                    {o.daysOrdered != null && o.daysOrdered > 14 && (
                      <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[10px] font-medium text-accent-deep">
                        {o.daysOrdered}d en producción
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink/60">
                    {o.email}
                    {o.midoceanOrderId && (
                      <>
                        {" · "}
                        <span className="font-mono text-[10px]">MidOcean {o.midoceanOrderId}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-semibold tabular-nums text-ink">
                    {o.acceptedTotalCents != null ? EUR.format(o.acceptedTotalCents / 100) : "—"}
                  </p>
                  {o.paidCents > 0 && (
                    <p className="text-[11px] text-social">✓ Pagado {EUR.format(o.paidCents / 100)}</p>
                  )}
                </div>
              </div>

              {/* Timeline visual */}
              <Timeline stage={o.stage} />

              {/* Footer fila */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink/60">
                <p className="truncate">
                  {o.unitsCount.toLocaleString("es-ES")} unidades · {o.itemsCount} productos
                  {o.topItems.length > 0 && ` · ${o.topItems.join(", ")}`}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {o.tracking?.code && (
                    <a
                      href={o.tracking.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-bone-soft px-2.5 py-1 text-[10px] font-medium text-ink/70 hover:text-accent"
                    >
                      📦 {o.tracking.carrier || "Tracking"}
                      <span className="font-mono">{o.tracking.code}</span>
                    </a>
                  )}
                  {o.midoceanOrderId && (
                    <button
                      type="button"
                      disabled={refreshing === o.id}
                      onClick={() => refreshTracking(o.id)}
                      className="rounded-full border border-line bg-bone-soft px-3 py-1 text-[11px] hover:border-accent disabled:opacity-40"
                    >
                      {refreshing === o.id ? "…" : "🔄 Actualizar"}
                    </button>
                  )}
                  <Link
                    href={`/admin/cart-quotes/${o.id}`}
                    className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-bone hover:bg-accent"
                  >
                    Abrir →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function Timeline({ stage }: { stage: Stage }) {
  const flow: Stage[] = [
    "RECEIVED",
    "REVIEWING",
    "QUOTE_SENT",
    "PAID",
    "PROOF_APPROVED",
    "IN_PRODUCTION",
    "SHIPPED",
    "DELIVERED",
  ];
  const idx = flow.indexOf(stage);
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {flow.map((s, i) => {
        const reached = idx >= 0 && i <= idx;
        const current = i === idx;
        return (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${
                current ? "bg-accent ring-2 ring-accent/30" : reached ? "bg-accent" : "bg-line"
              }`}
              title={STAGES.find((x) => x.key === s)?.label}
            />
            {i < flow.length - 1 && (
              <div className={`h-0.5 flex-1 ${reached && i < idx ? "bg-accent" : "bg-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
