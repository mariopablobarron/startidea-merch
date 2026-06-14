"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Broadcast = {
  id: string;
  subject: string;
  audience: "NEWSLETTER_ALL" | "NEWSLETTER_NEW" | "CUSTOMERS_ALL" | "CART_QUOTES_RECENT";
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  openedCount?: number;
  openRate?: number;
  createdAt: string;
  createdBy: string | null;
};

const AUDIENCE_LABELS: Record<Broadcast["audience"], string> = {
  NEWSLETTER_ALL: "Newsletter — todos",
  NEWSLETTER_NEW: "Newsletter — últimos 30d",
  CUSTOMERS_ALL: "Clientes con cuenta",
  CART_QUOTES_RECENT: "Leads cotizaciones 90d",
};

const STATUS_COLORS: Record<Broadcast["status"], string> = {
  DRAFT: "bg-bone-soft text-ink/50",
  SCHEDULED: "bg-accent-mist text-accent-deep",
  SENDING: "bg-accent/20 text-accent-deep",
  SENT: "bg-social/20 text-social",
  FAILED: "bg-accent-wash text-accent-deep",
  CANCELED: "bg-ink/5 text-ink/40",
};

export default function BroadcastsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Broadcast[]>([]);
  const [audienceSizes, setAudienceSizes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/broadcasts", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.broadcasts || []);
        setAudienceSizes(data.audienceSizes || {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createNew() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: "Borrador sin asunto",
          html: DEFAULT_HTML,
          audience: "NEWSLETTER_ALL",
        }),
      });
      const data = await res.json();
      if (res.ok && data.broadcast) {
        router.push(`/admin/marketing/broadcasts/${data.broadcast.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Email
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Broadcasts</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Envíos puntuales (newsletter, anuncio de producto, promo). Cada broadcast tiene su
              propia audiencia, plantilla y métricas. Los drips automáticos se gestionan en sus
              cron tasks.
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/admin/marketing/site" className="text-ink/60 hover:text-accent">
                Copy
              </Link>
              <Link href="/admin/marketing/banners" className="text-ink/60 hover:text-accent">
                Banners
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={createNew}
            disabled={creating}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {creating ? "Creando…" : "+ Nuevo broadcast"}
          </button>
        </header>

        {/* Audience sizes panel */}
        <section className="mb-6 grid gap-3 rounded-2xl border border-line bg-bone p-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(AUDIENCE_LABELS) as Broadcast["audience"][]).map((a) => (
            <div key={a}>
              <p className="text-[10px] uppercase tracking-wider text-ink/50">
                {AUDIENCE_LABELS[a]}
              </p>
              <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-ink">
                {(audienceSizes[a] ?? 0).toLocaleString("es-ES")}
              </p>
            </div>
          ))}
        </section>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">📧</p>
            <p className="mt-3 font-display text-lg text-ink">Sin broadcasts todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Crea uno para anunciar producto, promo o novedad.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Asunto</th>
                  <th className="p-3">Audiencia</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Enviados / Fallidos</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-t border-line hover:bg-bone-soft">
                    <td className="p-3">
                      <p className="font-medium text-ink">{b.subject}</p>
                      {b.createdBy && (
                        <p className="text-[10px] text-ink/40">por {b.createdBy}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink/60">{AUDIENCE_LABELS[b.audience]}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLORS[b.status]}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-xs tabular-nums">
                      <span className="text-social">{b.sentCount}</span>
                      {b.failedCount > 0 && (
                        <span className="text-accent-deep"> / {b.failedCount}</span>
                      )}
                      {b.sentCount > 0 && (
                        <div className="text-[10px] text-ink/55">
                          {b.openedCount ?? 0} aperturas · {b.openRate ?? 0}%
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink/60">
                      {b.sentAt
                        ? `Env. ${new Date(b.sentAt).toLocaleDateString("es-ES")}`
                        : b.scheduledAt
                          ? `Prog. ${new Date(b.scheduledAt).toLocaleDateString("es-ES")}`
                          : new Date(b.createdAt).toLocaleDateString("es-ES")}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/marketing/broadcasts/${b.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {b.status === "SENT" || b.status === "FAILED" ? "Ver" : "Editar"} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

const DEFAULT_HTML = `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
  <h2 style="font-family:Georgia,serif;color:#0a0a0b;">Hola {{firstName}},</h2>
  <p>Te escribimos porque…</p>
  <p style="margin:24px 0;">
    <a href="https://merchandising.hubstartidea.es/catalogo" style="display:inline-block;background:#ff6b35;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Ver catálogo →</a>
  </p>
</div>`;
