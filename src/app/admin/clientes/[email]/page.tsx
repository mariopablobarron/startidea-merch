"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const EUR0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Segment = "ENTERPRISE" | "MIDMARKET" | "STARTUP" | "ONE_OFF" | "PARTNER" | "CHURNED";

const SEGMENT_LABELS: Record<Segment, string> = {
  ENTERPRISE: "Enterprise",
  MIDMARKET: "Midmarket",
  STARTUP: "Startup",
  ONE_OFF: "Puntual",
  PARTNER: "Partner",
  CHURNED: "Churned",
};

type Detail = {
  email: string;
  profile: { email: string; tags: string[]; notes: string | null; segment: Segment | null };
  user: { id: string; name: string; lastLoginAt: string | null; createdAt: string } | null;
  carts: Array<{
    id: string;
    createdAt: string;
    status: string;
    company: string | null;
    name: string;
    message: string | null;
    estimatedTotalCents: number | null;
    acceptedTotalCents: number | null;
    confirmedAt: string | null;
    items: Array<{ quantity: number; productName: string }>;
    payments: Array<{ amountCents: number; paidAt: string | null; kind: string }>;
  }>;
  deliveries: Array<{
    id: string;
    status: "SENT" | "FAILED";
    sentAt: string;
    broadcast: { id: string; subject: string };
  }>;
  kpis: {
    ltvCents: number;
    paidCount: number;
    avgTicketCents: number;
    cartCount: number;
    firstPaidAt: string | null;
    lastPaidAt: string | null;
    remindersDripSent: number;
  };
};

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form state for tags + notes + segment
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [segment, setSegment] = useState<Segment | "">("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${email}`, { credentials: "include" });
      const d = await res.json();
      if (res.ok) {
        setDetail(d);
        setTagsText((d.profile.tags || []).join(", "));
        setNotes(d.profile.notes || "");
        setSegment(d.profile.segment || "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/customers/${email}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tags: tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          notes: notes.trim() || null,
          segment: segment || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: d.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado" });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !detail) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const k = detail.kpis;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">CRM</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {detail.carts[0]?.name || detail.email}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span className="font-mono">{detail.email}</span>
              {detail.carts[0]?.company && ` · ${detail.carts[0].company}`}
              {detail.user && (
                <span className="ml-2 rounded-full bg-social/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-social">
                  cuenta activa
                </span>
              )}
            </p>
          </div>
          <Link href="/admin/clientes" className="text-xs text-ink/60 hover:text-accent">
            ← Lista clientes
          </Link>
        </header>

        {/* KPIs */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Kpi
            label="LTV"
            value={k.ltvCents > 0 ? EUR0.format(k.ltvCents / 100) : "—"}
            color="text-social"
          />
          <Kpi label="Pagados" value={k.paidCount.toString()} />
          <Kpi label="Cestas" value={k.cartCount.toString()} />
          <Kpi
            label="Ticket medio"
            value={k.avgTicketCents > 0 ? EUR0.format(k.avgTicketCents / 100) : "—"}
          />
          <Kpi
            label="Primer pedido"
            value={k.firstPaidAt ? new Date(k.firstPaidAt).toLocaleDateString("es-ES") : "—"}
          />
          <Kpi
            label="Último pedido"
            value={k.lastPaidAt ? new Date(k.lastPaidAt).toLocaleDateString("es-ES") : "—"}
          />
          <Kpi label="Drips enviados" value={k.remindersDripSent.toString()} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
          {/* IZQUIERDA — historial */}
          <section className="space-y-4">
            <div className="rounded-2xl border border-line bg-bone p-5">
              <h2 className="mb-3 font-display text-base font-semibold text-ink">
                Histórico de cestas ({detail.carts.length})
              </h2>
              {detail.carts.length === 0 ? (
                <p className="text-xs text-ink/50">Sin cestas</p>
              ) : (
                <ul className="space-y-3">
                  {detail.carts.map((c) => {
                    const totalPaid = c.payments.reduce((s, p) => s + p.amountCents, 0);
                    return (
                      <li
                        key={c.id}
                        className="rounded-xl border border-line bg-bone-soft p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-ink">
                            {new Date(c.createdAt).toLocaleString("es-ES", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              c.status === "ORDERED"
                                ? "bg-accent text-bone"
                                : c.status === "CONFIRMED"
                                  ? "bg-social/20 text-social"
                                  : c.status === "ARCHIVED"
                                    ? "bg-ink/5 text-ink/40"
                                    : "bg-bone text-ink/60"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
                        <ul className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-ink/60">
                          {c.items.map((it, i) => (
                            <li
                              key={i}
                              className="rounded-full border border-line bg-bone px-1.5 py-0.5"
                            >
                              {it.quantity}× {it.productName}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                          <span className="text-ink/60">
                            {c.estimatedTotalCents
                              ? `Estimado ${EUR.format(c.estimatedTotalCents / 100)}`
                              : "Sin estimación"}
                            {c.acceptedTotalCents
                              ? ` · Aceptado ${EUR.format(c.acceptedTotalCents / 100)}`
                              : ""}
                          </span>
                          {totalPaid > 0 && (
                            <span className="font-semibold text-social">
                              Pagado {EUR.format(totalPaid / 100)}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/admin/cart-quotes/${c.id}`}
                          className="mt-1 inline-block text-[11px] text-accent hover:underline"
                        >
                          Ver detalle →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-bone p-5">
              <h2 className="mb-3 font-display text-base font-semibold text-ink">
                Emails recibidos ({detail.deliveries.length})
              </h2>
              {detail.deliveries.length === 0 ? (
                <p className="text-xs text-ink/50">No ha recibido broadcasts todavía</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {detail.deliveries.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 border-b border-line/60 py-1 last:border-0"
                    >
                      <span className="truncate text-ink">{d.broadcast.subject}</span>
                      <span className="flex items-center gap-2">
                        {d.status === "FAILED" ? (
                          <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-deep">
                            fallo
                          </span>
                        ) : (
                          <span className="rounded-full bg-social/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-social">
                            ok
                          </span>
                        )}
                        <span className="text-ink/50 tabular-nums">
                          {new Date(d.sentAt).toLocaleDateString("es-ES")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* DERECHA — perfil editable */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-line bg-bone p-5">
              <h2 className="mb-3 font-display text-base font-semibold text-ink">Perfil CRM</h2>

              <Field label="Segmento">
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value as Segment | "")}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">— Sin asignar —</option>
                  {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                    <option key={s} value={s}>
                      {SEGMENT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Tags"
                help="Separados por coma. Ej: hot-lead, recurrente, devops"
              >
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="hot-lead, recurrente, ferias"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>

              <Field
                label="Notas internas"
                help="Solo el equipo lo ve. Máximo 5.000 chars."
              >
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  placeholder="Acuerdos, reuniones, observaciones, contactos…"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-1 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar perfil"}
              </button>

              {feedback && (
                <p
                  className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                    feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
                  }`}
                >
                  {feedback.ok ? "✓" : "⚠"} {feedback.msg}
                </p>
              )}
            </div>

            {detail.user && (
              <div className="rounded-2xl border border-line bg-bone p-5 text-sm">
                <h3 className="font-display text-sm font-semibold text-ink">Cuenta cliente</h3>
                <p className="mt-2 text-xs text-ink/60">
                  Cuenta creada {new Date(detail.user.createdAt).toLocaleDateString("es-ES")}
                </p>
                {detail.user.lastLoginAt && (
                  <p className="text-xs text-ink/60">
                    Último acceso{" "}
                    {new Date(detail.user.lastLoginAt).toLocaleString("es-ES")}
                  </p>
                )}
              </div>
            )}

            <a
              href={`mailto:${detail.email}`}
              className="block rounded-2xl border border-line bg-bone p-5 text-sm hover:border-accent"
            >
              <p className="font-display text-sm font-semibold text-ink">📧 Escribir email</p>
              <p className="mt-1 break-all text-[11px] text-ink/60">{detail.email}</p>
            </a>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bone p-3">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p
        className={`mt-0.5 font-display text-lg font-semibold tabular-nums ${color || "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
