"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type Audience = "NEWSLETTER_ALL" | "NEWSLETTER_NEW" | "CUSTOMERS_ALL" | "CART_QUOTES_RECENT";
type Status = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";

const AUDIENCE_LABELS: Record<Audience, string> = {
  NEWSLETTER_ALL: "Newsletter — todos los suscriptores",
  NEWSLETTER_NEW: "Newsletter — nuevos (últimos 30 días)",
  CUSTOMERS_ALL: "Clientes con cuenta",
  CART_QUOTES_RECENT: "Leads — cotizaciones últimos 90 días",
};

type Broadcast = {
  id: string;
  subject: string;
  preheader: string | null;
  html: string;
  text: string | null;
  audience: Audience;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdBy: string | null;
};

const TEMPLATES = {
  blank: { subject: "", html: "" },
  promo: {
    subject: "🎁 Promoción exclusiva para ti",
    html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
  <h2 style="font-family:Georgia,serif;font-size:28px;">Hola {{firstName}},</h2>
  <p style="font-size:16px;">Esta semana lanzamos una promoción que pensamos te va a interesar:</p>

  <div style="margin:24px 0;padding:24px;background:linear-gradient(135deg,#ff6b35 0%,#ff8a5b 100%);color:#fff;border-radius:16px;text-align:center;">
    <p style="margin:0;font-size:13px;letter-spacing:2px;opacity:.85;">DESCUENTO POR VOLUMEN</p>
    <p style="margin:8px 0;font-family:Georgia,serif;font-size:42px;font-weight:600;">-15%</p>
    <p style="margin:0;font-size:14px;opacity:.9;">en pedidos de más de 250 unidades · cupón VOLUMEN15</p>
  </div>

  <p style="margin-top:24px;text-align:center;">
    <a href="https://merchandising.hubstartidea.es/catalogo" style="display:inline-block;background:#ff6b35;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ver catálogo →</a>
  </p>
</div>`,
  },
  novedad: {
    subject: "👀 Tienes que ver esto: novedades en TodoMerchandising",
    html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
  <h2 style="font-family:Georgia,serif;font-size:28px;">Hola {{firstName}},</h2>
  <p>Hemos sumado al catálogo productos nuevos que pueden encajar con vuestra próxima campaña:</p>

  <ul style="line-height:1.8;font-size:15px;">
    <li><b>Termos térmicos de doble pared</b> — láser hasta 4 colores, desde 4,50€/ud</li>
    <li><b>Mochilas RPET reciclado</b> — capacidad 18L, etiqueta GRS, desde 8€/ud</li>
    <li><b>Polos técnicos algodón orgánico</b> — bordado o DTF, desde 9€/ud</li>
  </ul>

  <p style="margin:24px 0;text-align:center;">
    <a href="https://merchandising.hubstartidea.es/catalogo?sort=recent" style="display:inline-block;background:#ff6b35;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ver novedades →</a>
  </p>
</div>`,
  },
  recordatorio: {
    subject: "Una pregunta rápida sobre vuestro merchandising",
    html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
  <h2 style="font-family:Georgia,serif;font-size:24px;">Hola {{firstName}},</h2>
  <p>Hace unos meses miraste catálogo en TodoMerchandising. ¿Surgió alguna campaña que necesite producción?</p>

  <p>Si tienes una idea o un evento próximo, te cerramos cotización con tarifas en menos de 24h.</p>

  <p style="margin:24px 0;text-align:center;">
    <a href="https://merchandising.hubstartidea.es/cotizar" style="display:inline-block;background:#ff6b35;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Pedir cotización →</a>
  </p>

  <p style="font-size:13px;color:#666;">Si prefieres hablar antes, responde a este email y te marcamos.</p>
</div>`,
  },
};

export default function BroadcastEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [audienceSizes, setAudienceSizes] = useState<Record<string, number>>({});

  // Form state
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [html, setHtml] = useState("");
  const [audience, setAudience] = useState<Audience>("NEWSLETTER_ALL");
  const [scheduledAt, setScheduledAt] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/broadcasts/${id}`, { credentials: "include" }),
        fetch("/api/admin/broadcasts", { credentials: "include" }),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      if (r1.ok && d1.broadcast) {
        setBroadcast(d1.broadcast);
        setSubject(d1.broadcast.subject);
        setPreheader(d1.broadcast.preheader || "");
        setHtml(d1.broadcast.html);
        setAudience(d1.broadcast.audience);
        setScheduledAt(d1.broadcast.scheduledAt ? d1.broadcast.scheduledAt.slice(0, 16) : "");
      }
      if (r2.ok) setAudienceSizes(d2.audienceSizes || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject,
          preheader: preheader || null,
          html,
          audience,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        setFeedback({ ok: true, msg: "Guardado" });
        setBroadcast(data.broadcast);
      }
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testEmail) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ testEmail }),
      });
      const data = await res.json();
      setFeedback(
        res.ok
          ? { ok: true, msg: `Test enviado a ${data.sentTo}` }
          : { ok: false, msg: data.error || "Error" },
      );
    } finally {
      setSending(false);
    }
  }

  async function sendNow() {
    const size = audienceSizes[audience] ?? 0;
    if (
      !confirm(
        `¿Enviar a TODOS los ${size.toLocaleString("es-ES")} destinatarios de "${AUDIENCE_LABELS[audience]}"?\n\nEsto NO se puede deshacer.`,
      )
    ) {
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      // Antes de enviar, guardamos el último estado del editor
      await save();
      const res = await fetch(`/api/admin/broadcasts/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const data = await res.json();
      setFeedback(
        res.ok
          ? {
              ok: true,
              msg: `Enviado · ${data.sentCount} OK · ${data.failedCount} fallidos`,
            }
          : { ok: false, msg: data.error || "Error" },
      );
      await load();
    } finally {
      setSending(false);
    }
  }

  function applyTemplate(name: keyof typeof TEMPLATES) {
    const t = TEMPLATES[name];
    if (!confirm("Sobreescribir el contenido actual con esta plantilla?")) return;
    if (t.subject) setSubject(t.subject);
    if (t.html) setHtml(t.html);
  }

  if (loading || !broadcast) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const isLocked = broadcast.status === "SENT" || broadcast.status === "SENDING";
  const audienceSize = audienceSizes[audience] ?? 0;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · Broadcast
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {subject || "Borrador sin asunto"}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span
                className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  broadcast.status === "SENT"
                    ? "bg-social/20 text-social"
                    : broadcast.status === "SENDING"
                      ? "bg-accent/20 text-accent-deep"
                      : "bg-bone-soft text-ink/60"
                }`}
              >
                {broadcast.status}
              </span>
              {broadcast.sentAt &&
                `Enviado ${new Date(broadcast.sentAt).toLocaleString("es-ES")} · ${broadcast.sentCount} OK · ${broadcast.failedCount} fallidos`}
            </p>
          </div>
          <Link
            href="/admin/marketing/broadcasts"
            className="text-xs text-ink/60 hover:text-accent"
          >
            ← Lista
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
          {/* IZQUIERDA — formulario */}
          <section className="space-y-4">
            <div className="rounded-2xl border border-line bg-bone p-5">
              <h2 className="mb-3 font-display text-base font-semibold text-ink">Plantillas</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => applyTemplate(k)}
                    disabled={isLocked}
                    className="rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs hover:border-accent disabled:opacity-40"
                  >
                    {k === "blank"
                      ? "📄 Blanco"
                      : k === "promo"
                        ? "🎁 Promoción"
                        : k === "novedad"
                          ? "👀 Novedad"
                          : "💬 Recordatorio"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-line bg-bone p-5">
              <Field label="Audiencia">
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  disabled={isLocked}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                >
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCE_LABELS[a]} ({(audienceSizes[a] ?? 0).toLocaleString("es-ES")})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-accent">
                  Se enviará a {audienceSize.toLocaleString("es-ES")} destinatarios
                </p>
              </Field>

              <Field label="Asunto">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isLocked}
                  maxLength={200}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field
                label="Preheader (opcional)"
                help="Texto preview en la bandeja de entrada (Gmail/Outlook)"
              >
                <input
                  type="text"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  disabled={isLocked}
                  maxLength={200}
                  placeholder="Resumen de 1 línea que aparece junto al asunto…"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field
                label="HTML del email"
                help="Variables: {{firstName}} {{name}}. Se añade footer auto con baja si no está incluido."
              >
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  disabled={isLocked}
                  rows={16}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field
                label="Programar envío (opcional)"
                help="Si rellenas, queda en estado SCHEDULED. Cron diario lo procesará a esa hora."
              >
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={isLocked}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || isLocked || !subject.trim() || !html.trim()}
                  className="rounded-full border border-line bg-bone px-4 py-2 text-xs font-medium hover:border-accent disabled:opacity-40"
                >
                  {saving ? "Guardando…" : "Guardar borrador"}
                </button>
              </div>
            </div>

            {/* Test send */}
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
              <h3 className="font-display text-sm font-semibold text-ink">Enviar prueba</h3>
              <p className="mt-1 text-[11px] text-ink/60">
                Revisa cómo queda en bandeja real antes de enviar a la audiencia.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="flex-1 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={sending || !testEmail || !subject.trim() || !html.trim()}
                  className="rounded-full bg-accent-deep px-4 py-2 text-xs font-semibold text-bone hover:bg-accent disabled:opacity-40"
                >
                  Enviar test
                </button>
              </div>
            </div>

            {/* Send to audience */}
            {!isLocked && (
              <div className="rounded-2xl border-2 border-accent bg-bone p-5">
                <h3 className="font-display text-sm font-semibold text-ink">
                  Enviar a la audiencia
                </h3>
                <p className="mt-1 text-[11px] text-ink/60">
                  Acción IRREVERSIBLE. Se enviará a{" "}
                  <strong>{audienceSize.toLocaleString("es-ES")}</strong> destinatarios. Asegúrate
                  de haber probado con &quot;Enviar test&quot;.
                </p>
                <button
                  type="button"
                  onClick={sendNow}
                  disabled={sending || audienceSize === 0 || !subject.trim() || !html.trim()}
                  className="mt-3 w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                >
                  {sending ? "Enviando…" : `🚀 Enviar ahora a ${audienceSize.toLocaleString("es-ES")} personas`}
                </button>
              </div>
            )}

            {feedback && (
              <p
                className={`rounded-lg px-3 py-2 text-xs ${
                  feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
                }`}
              >
                {feedback.ok ? "✓" : "⚠"} {feedback.msg}
              </p>
            )}
          </section>

          {/* DERECHA — preview */}
          <section className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
              Preview
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              <div className="border-b border-line bg-bone-soft p-3 text-xs">
                <p className="font-medium text-ink">{subject || "(asunto)"}</p>
                {preheader && <p className="mt-0.5 text-ink/60">{preheader}</p>}
              </div>
              <div
                className="max-h-[700px] overflow-auto p-4"
                dangerouslySetInnerHTML={{
                  __html: html.replace(/\{\{firstName\}\}/g, "Mario").replace(/\{\{name\}\}/g, "Mario Pablo"),
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
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
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
