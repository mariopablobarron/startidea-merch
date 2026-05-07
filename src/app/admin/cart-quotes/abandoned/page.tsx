"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type AbandonedCart = {
  id: string;
  createdAt: string;
  hoursOld: number;
  name: string;
  company: string | null;
  email: string;
  status: "NEW" | "IN_PROGRESS";
  itemsCount: number;
  topItems: string[];
  estimatedTotalCents: number | null;
  reminderSentAt: string | null;
  reminderCount: number;
};

export default function AbandonedCartsPage() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null); // cartId que está enviando
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [showCustomFor, setShowCustomFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cart-quotes/abandoned", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error cargando");
        return;
      }
      setCarts(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function sendReminder(id: string) {
    setSending(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${id}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ id, ok: false, msg: data.error || "Error" });
      } else {
        setFeedback({
          id,
          ok: true,
          msg: `Enviado a ${data.sentTo} · total recordatorios: ${data.reminderCount}`,
        });
        setCustomMessage("");
        setShowCustomFor(null);
        // refresh para que desaparezca de la lista (cooldown 48h)
        setTimeout(load, 1200);
      }
    } catch (e) {
      setFeedback({ id, ok: false, msg: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSending(null);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Carritos abandonados
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Cotizaciones con email pero sin enviar al cliente, &gt; 4h. Con cooldown anti-spam de 48h
            entre recordatorios al mismo cliente.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/admin/cart-quotes"
              className="text-xs text-ink/60 hover:text-accent"
            >
              ← Volver a todos los carritos
            </Link>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs hover:border-accent"
            >
              Refrescar
            </button>
          </div>
        </header>

        {error && (
          <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando carritos abandonados…</p>
        ) : carts.length === 0 ? (
          <div className="rounded-2xl border border-line bg-bone p-10 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-3 font-display text-lg text-ink">No hay carritos abandonados</p>
            <p className="mt-1 text-sm text-ink/60">
              Todos los clientes con cotización pendiente están en zona de gracia (&lt; 4h) o ya han
              recibido recordatorio en las últimas 48h.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink/70">
              {carts.length} {carts.length === 1 ? "carrito abandonado" : "carritos abandonados"} ·
              ordenados por más antiguo primero
            </p>
            {carts.map((c) => {
              const isSending = sending === c.id;
              const fb = feedback?.id === c.id ? feedback : null;
              const isExpanded = showCustomFor === c.id;
              return (
                <article
                  key={c.id}
                  className="rounded-2xl border border-line bg-bone p-5 transition hover:border-accent/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h2 className="font-display text-lg font-semibold text-ink">
                          {c.name}
                        </h2>
                        {c.company && (
                          <span className="text-sm text-ink/60">· {c.company}</span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            c.status === "NEW"
                              ? "bg-accent/10 text-accent-deep"
                              : "bg-social/15 text-social"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink/50">
                        {c.email} · hace {c.hoursOld}h ·{" "}
                        {c.itemsCount} {c.itemsCount === 1 ? "producto" : "productos"}
                        {c.estimatedTotalCents != null
                          ? ` · estimado ${EUR.format(c.estimatedTotalCents / 100)}`
                          : ""}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink/70">
                        {c.topItems.map((it, i) => (
                          <li
                            key={i}
                            className="rounded-full border border-line bg-bone-soft px-2 py-0.5"
                          >
                            {it}
                          </li>
                        ))}
                      </ul>
                      {c.reminderSentAt && (
                        <p className="mt-2 text-[11px] text-ink/40">
                          Último recordatorio:{" "}
                          {new Date(c.reminderSentAt).toLocaleString("es-ES")} ·{" "}
                          {c.reminderCount}{" "}
                          {c.reminderCount === 1 ? "envío" : "envíos"} totales
                        </p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/admin/cart-quotes/${c.id}`}
                        className="text-xs text-ink/60 hover:text-accent"
                      >
                        Ver detalle →
                      </Link>
                      <button
                        type="button"
                        onClick={() => setShowCustomFor(isExpanded ? null : c.id)}
                        className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs hover:border-accent"
                      >
                        {isExpanded ? "Cerrar" : "Personalizar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendReminder(c.id)}
                        disabled={isSending}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                      >
                        {isSending
                          ? "Enviando…"
                          : c.reminderCount === 0
                            ? "Enviar recordatorio"
                            : "Reenviar"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 rounded-xl border border-line bg-bone-soft p-3">
                      <label className="text-[11px] uppercase tracking-wider text-ink/50">
                        Mensaje personalizado (opcional)
                      </label>
                      <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Ej: 'Tenemos una promoción 10% off si confirmas antes del viernes'"
                        className="mt-1 w-full rounded-lg border border-line bg-bone p-2 text-sm outline-none focus:border-accent"
                        rows={3}
                        maxLength={500}
                      />
                      <p className="mt-1 text-[10px] text-ink/40">
                        {customMessage.length}/500 · se inserta en un cuadro destacado dentro del
                        email
                      </p>
                    </div>
                  )}

                  {fb && (
                    <p
                      className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                        fb.ok
                          ? "bg-social/10 text-social"
                          : "bg-accent-wash text-accent-deep"
                      }`}
                    >
                      {fb.ok ? "✓" : "⚠"} {fb.msg}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
