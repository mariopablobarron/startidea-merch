"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type Audience =
  | "NEWSLETTER_ALL"
  | "NEWSLETTER_NEW"
  | "NEWSLETTER_TAG"
  | "NEWSLETTER_ENGAGED"
  | "NEWSLETTER_DORMANT"
  | "NEWSLETTER_SOURCE"
  | "CUSTOMERS_ALL"
  | "CART_QUOTES_RECENT";
type Status = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";

const AUDIENCE_LABELS: Record<Audience, string> = {
  NEWSLETTER_ALL: "Newsletter — todos los suscriptores",
  NEWSLETTER_NEW: "Newsletter — nuevos (últimos 30 días)",
  NEWSLETTER_TAG: "Newsletter — por tag(s) específicos",
  NEWSLETTER_ENGAGED: "Newsletter — activos (han abierto algún email)",
  NEWSLETTER_DORMANT: "Newsletter — dormidos (reactivación)",
  NEWSLETTER_SOURCE: "Newsletter — por origen",
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
  audienceTags: string[];
  audienceSource: string | null;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdBy: string | null;
  stats?: {
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    deliveryRate: number;
    openRate: number;
    openRateOnDelivered: number;
    clickRate: number;
    bounceRate: number;
    totalOpens: number;
    totalClicks: number;
  };
};

type AvailableTag = { tag: string; count: number };
type AvailableSource = { source: string; count: number };

// Plantillas-arranque: el envío aplica automáticamente el wrap Startidea
// (crema + card blanca + footer oscuro). Aquí sólo el cuerpo editable.
const TEMPLATES = {
  blank: { subject: "", html: "" },
  promo: {
    subject: "Promoción por volumen para tu próximo pedido",
    html: `<p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Promoción activa</p>
<h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
  Hola {{firstName}}.<br>
  <span style="color:#E63E73;">-15% por volumen este mes.</span>
</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
  Si tienes evento, lanzamiento o cierre de Q a la vista, aplicamos un -15% sobre
  cualquier pedido superior a 250 unidades. Cotización cerrada en menos de 24h.
</p>
<div style="margin:24px 0;background:#FBDFE9;border:2px dashed #E63E73;padding:20px;text-align:center;border-radius:12px;">
  <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Tu cupón este mes</p>
  <p style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#E63E73;letter-spacing:0.05em;">VOLUMEN15</p>
  <p style="margin:8px 0 0;font-size:12px;color:#6b6b6b;">Válido en pedidos &gt; 250 uds · este mes</p>
</div>
<p style="margin:24px 0;text-align:center;">
  <a href="https://merchandising.startidea.es/catalogo" style="display:inline-block;background:#E63E73;color:#FFFFFF;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Ver catálogo →</a>
</p>`,
  },
  novedad: {
    subject: "Novedades en catálogo que pueden encajar con vuestra próxima campaña",
    html: `<p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Nuevos en catálogo</p>
<h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
  Hola {{firstName}}.<br>
  <span style="color:#E63E73;">Hemos sumado tres referencias.</span>
</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
  Tres productos nuevos que pueden encajar con vuestra próxima campaña corporativa:
</p>
<table style="width:100%;border-collapse:separate;border-spacing:0 8px;margin:16px 0 0;">
  <tr><td style="background:#F4EFE6;padding:16px 20px;border-radius:12px;font-size:14px;line-height:1.5;color:#2A2A2A;">
    <strong>Termos térmicos doble pared</strong><br>
    <span style="color:#6b6b6b;font-size:13px;">Láser hasta 4 colores · desde 4,50 €/ud</span>
  </td></tr>
  <tr><td style="background:#F4EFE6;padding:16px 20px;border-radius:12px;font-size:14px;line-height:1.5;color:#2A2A2A;">
    <strong>Mochilas RPET reciclado</strong><br>
    <span style="color:#6b6b6b;font-size:13px;">Capacidad 18 L · etiqueta GRS · desde 8 €/ud</span>
  </td></tr>
  <tr><td style="background:#F4EFE6;padding:16px 20px;border-radius:12px;font-size:14px;line-height:1.5;color:#2A2A2A;">
    <strong>Polos técnicos algodón orgánico</strong><br>
    <span style="color:#6b6b6b;font-size:13px;">Bordado o DTF · desde 9 €/ud</span>
  </td></tr>
</table>
<p style="margin:24px 0;text-align:center;">
  <a href="https://merchandising.startidea.es/catalogo?sort=recent" style="display:inline-block;background:#E63E73;color:#FFFFFF;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Ver novedades →</a>
</p>`,
  },
  recordatorio: {
    subject: "Una pregunta rápida sobre vuestro próximo merchandising",
    html: `<p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Hace tiempo que no hablamos</p>
<h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
  Hola {{firstName}}.<br>
  <span style="color:#a09e98;">¿Hay próxima campaña en mente?</span>
</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
  Hace unos meses miraste catálogo en TodoMerchandising. Si surgió evento,
  onboarding o cierre de Q que necesite producción, te cerramos cotización con
  tarifas en menos de 24h laborables.
</p>
<p style="margin:24px 0;text-align:center;">
  <a href="https://merchandising.startidea.es/cotizar" style="display:inline-block;background:#E63E73;color:#FFFFFF;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Pedir cotización →</a>
</p>
<p style="margin:16px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;text-align:center;">
  Si prefieres hablar antes, responde a este email y te marcamos.
</p>`,
  },
  reactivar: {
    subject: "¿Seguimos en contacto?",
    html: `<p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Queremos respetar tu bandeja</p>
<h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
  Hola {{firstName}}.<br>
  <span style="color:#E63E73;">¿Te seguimos escribiendo?</span>
</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
  Hace tiempo que no sabemos de ti, y no queremos llenar tu bandeja si ya no te
  interesa. Si quieres seguir recibiendo novedades de catálogo y promociones de
  TodoMerchandising —con cada pedido generando empleo en Centros Especiales de
  Empleo de Granada—, solo tienes que echar un vistazo:
</p>
<p style="margin:24px 0;text-align:center;">
  <a href="https://merchandising.startidea.es/catalogo?utm_source=newsletter&utm_medium=email&utm_campaign=reactivacion" style="display:inline-block;background:#E63E73;color:#FFFFFF;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Sí, sigo interesado/a →</a>
</p>
<p style="margin:16px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;text-align:center;">
  Si no haces nada, no pasa nada: dejaremos de escribirte pronto para no molestar.
  Y si prefieres la baja directa, la tienes abajo.
</p>`,
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
  const [audienceTags, setAudienceTags] = useState<string[]>([]);
  const [audienceSource, setAudienceSource] = useState("");
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([]);
  const [availableSources, setAvailableSources] = useState<AvailableSource[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/admin/broadcasts/${id}`, { credentials: "include" }),
        fetch("/api/admin/broadcasts", { credentials: "include" }),
        fetch("/api/admin/broadcasts/tags", { credentials: "include" }),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();
      if (r1.ok && d1.broadcast) {
        setBroadcast(d1.broadcast);
        setSubject(d1.broadcast.subject);
        setPreheader(d1.broadcast.preheader || "");
        setHtml(d1.broadcast.html);
        setAudience(d1.broadcast.audience);
        setAudienceTags(d1.broadcast.audienceTags || []);
        setAudienceSource(d1.broadcast.audienceSource || "");
        setScheduledAt(d1.broadcast.scheduledAt ? d1.broadcast.scheduledAt.slice(0, 16) : "");
      }
      if (r2.ok) setAudienceSizes(d2.audienceSizes || {});
      if (r3.ok) {
        setAvailableTags(d3.tags || []);
        setAvailableSources(d3.sources || []);
      }
    } finally {
      setLoading(false);
    }
  }

  // Tamaño dinámico cuando audience=NEWSLETTER_TAG (suma de los tags
  // seleccionados; es un "≤ N" porque un subscriber puede estar en varios).
  const tagsAudienceSize =
    audience === "NEWSLETTER_TAG"
      ? availableTags
          .filter((t) => audienceTags.includes(t.tag))
          .reduce((acc, t) => acc + t.count, 0)
      : 0;
  // Tamaño cuando audience=NEWSLETTER_SOURCE (conteo exacto del origen elegido).
  const sourceAudienceSize =
    audience === "NEWSLETTER_SOURCE"
      ? availableSources.find((s) => s.source === audienceSource)?.count ?? 0
      : 0;
  // Tamaño efectivo para botones y avisos (TAG/SOURCE se resuelven en cliente,
  // el resto vienen precalculados del backend).
  const audienceSize =
    audience === "NEWSLETTER_TAG"
      ? tagsAudienceSize
      : audience === "NEWSLETTER_SOURCE"
        ? sourceAudienceSize
        : audienceSizes[audience] ?? 0;

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
          audienceTags: audience === "NEWSLETTER_TAG" ? audienceTags : [],
          audienceSource: audience === "NEWSLETTER_SOURCE" ? audienceSource || null : null,
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
    const size = audienceSize;
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

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
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

        {/* Estadísticas — solo cuando ya se envió */}
        {broadcast.status === "SENT" && broadcast.stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Enviados" value={broadcast.sentCount.toLocaleString("es-ES")} sub={broadcast.failedCount > 0 ? `${broadcast.failedCount} fallidos` : "sin fallos"} />
            <StatCard
              label="Entregados"
              value={broadcast.stats.delivered > 0 ? `${broadcast.stats.deliveryRate}%` : "—"}
              sub={broadcast.stats.delivered > 0 ? `${broadcast.stats.delivered.toLocaleString("es-ES")} en bandeja` : "sin datos aún"}
              accent={broadcast.stats.deliveryRate >= 90}
            />
            <StatCard
              label="Aperturas"
              value={`${broadcast.stats.openRate}%`}
              sub={
                broadcast.stats.delivered > 0
                  ? `${broadcast.stats.opened.toLocaleString("es-ES")} · ${broadcast.stats.openRateOnDelivered}% de entregados`
                  : `${broadcast.stats.opened.toLocaleString("es-ES")} personas`
              }
              accent={broadcast.stats.opened > 0}
            />
            <StatCard
              label="Clics"
              value={`${broadcast.stats.clickRate}%`}
              sub={`${broadcast.stats.clicked.toLocaleString("es-ES")} personas`}
              accent={broadcast.stats.clicked > 0}
            />
            <StatCard
              label="Rebotes"
              value={`${broadcast.stats.bounceRate}%`}
              sub={
                broadcast.stats.bounceRate > 3
                  ? `⚠ ${broadcast.stats.bounced} · alto (>3%)`
                  : `${broadcast.stats.bounced.toLocaleString("es-ES")} rebotes`
              }
            />
            <StatCard
              label="Interacciones"
              value={(broadcast.stats.totalOpens + broadcast.stats.totalClicks).toLocaleString("es-ES")}
              sub={`${broadcast.stats.totalOpens} aperturas · ${broadcast.stats.totalClicks} clics`}
            />
          </div>
        )}
        {broadcast.status === "SENT" && broadcast.stats && broadcast.stats.opened === 0 && (
          <p className="mb-6 -mt-3 text-[11px] text-ink/45">
            Aperturas/clics tardan unos minutos (webhook de Resend). Si <strong>Entregados</strong> es alto pero las aperturas siguen a 0, suele ser que la campaña salió antes de activar el open-tracking (píxel no inyectado) — se medirá en la siguiente. Si <strong>Entregados</strong> es bajo, es entregabilidad (dominio frío en warmup). El webhook debe apuntar a <code>/api/webhooks/resend</code> con los eventos delivered/opened/clicked activos.
          </p>
        )}

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
                          : k === "recordatorio"
                            ? "💬 Recordatorio"
                            : "♻️ Reactivar"}
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
                      {AUDIENCE_LABELS[a]}
                      {a !== "NEWSLETTER_TAG" && audienceSizes[a] !== undefined
                        ? ` (${(audienceSizes[a] ?? 0).toLocaleString("es-ES")})`
                        : ""}
                    </option>
                  ))}
                </select>
                {audience === "NEWSLETTER_TAG" ? (
                  <div className="mt-3 rounded-xl border border-line bg-bone-soft p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink/60">
                      Selecciona las listas (tags) destinatarias
                    </p>
                    {availableTags.length === 0 ? (
                      <p className="text-xs text-ink/55">
                        No hay tags todavía. Importa primero subscribers desde{" "}
                        <Link href="/admin/marketing/newsletter" className="text-accent underline">
                          Newsletter
                        </Link>
                        .
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {availableTags.map((t) => {
                          const checked = audienceTags.includes(t.tag);
                          return (
                            <label
                              key={t.tag}
                              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-bone"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isLocked}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setAudienceTags([...audienceTags, t.tag]);
                                    else
                                      setAudienceTags(
                                        audienceTags.filter((x) => x !== t.tag),
                                      );
                                  }}
                                  className="h-3.5 w-3.5 rounded border-line accent-accent"
                                />
                                <span className="font-mono text-ink/85">{t.tag}</span>
                              </span>
                              <span className="rounded-full bg-bone px-2 py-0.5 text-[10px] tabular-nums text-ink/55">
                                {t.count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {audienceTags.length > 0 && (
                      <p className="mt-2 text-[11px] text-accent">
                        ≤ {tagsAudienceSize.toLocaleString("es-ES")} destinatarios
                        {audienceTags.length > 1 && " (dedupe de los que estén en varios tags)"}
                      </p>
                    )}
                  </div>
                ) : audience === "NEWSLETTER_SOURCE" ? (
                  <div className="mt-3 rounded-xl border border-line bg-bone-soft p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink/60">
                      Origen de los subscribers
                    </p>
                    {availableSources.length === 0 ? (
                      <p className="text-xs text-ink/55">No hay orígenes registrados todavía.</p>
                    ) : (
                      <select
                        value={audienceSource}
                        onChange={(e) => setAudienceSource(e.target.value)}
                        disabled={isLocked}
                        className="w-full rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                      >
                        <option value="">— elige un origen —</option>
                        {availableSources.map((s) => (
                          <option key={s.source} value={s.source}>
                            {s.source} ({s.count})
                          </option>
                        ))}
                      </select>
                    )}
                    {audienceSource && (
                      <p className="mt-2 text-[11px] text-accent">
                        {sourceAudienceSize.toLocaleString("es-ES")} destinatarios
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-accent">
                    Se enviará a {audienceSize.toLocaleString("es-ES")} destinatarios
                  </p>
                )}
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
                help="Si rellenas, queda en SCHEDULED y un cron lo envía solo a esa hora (revisa cada ~5 min)."
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

          {/* DERECHA — preview con wrap Startidea aplicado */}
          <section className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
              Preview · así llega al buzón
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              <div className="border-b border-line bg-bone-soft p-3 text-xs">
                <p className="font-medium text-ink">{subject || "(asunto)"}</p>
                {preheader && <p className="mt-0.5 text-ink/60">{preheader}</p>}
              </div>
              {/* El cuerpo del broadcast es HTML ajeno (plantillas pegadas de
                  terceros, generadores externos). Se pinta dentro de un iframe
                  aislado y SIN `allow-scripts`: así el preview enseña exactamente
                  lo que llega al buzón —sanearlo mentiría sobre el envío— y a la
                  vez ningún <script> ni handler inline puede ejecutarse en el
                  panel de quien lo edita. No usar dangerouslySetInnerHTML aquí. */}
              <iframe
                title="Preview del broadcast"
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[700px] w-full border-0"
                srcDoc={previewWithStartideaWrap(
                  html.replace(/\{\{firstName\}\}/g, "Mario").replace(/\{\{name\}\}/g, "Mario Pablo"),
                )}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink/50 leading-relaxed">
              El cuerpo se envuelve automáticamente en el template Startidea (crema,
              card blanca, footer con marca y baja). Si quieres mandar HTML 100% custom,
              escribe el doc completo empezando por <code>&lt;!doctype html&gt;</code>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * Envuelve el cuerpo del broadcast con el template Startidea para que el
 * preview enseñe lo mismo que se envía. Espejo (front-only) de applyFooter()
 * en /api/admin/broadcasts/[id]/send/route.ts.
 */
function previewWithStartideaWrap(bodyHtml: string): string {
  const trimmed = bodyHtml.trim();
  const isFullDoc = /^<!doctype/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
  if (isFullDoc) return bodyHtml;
  return `
<div style="background:#F4EFE6;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;color:#2A2A2A;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <div style="padding:32px 32px 8px;">
${bodyHtml}
    </div>
    <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
      <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
      <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
      <p style="margin:6px 0 0;color:rgba(244,239,230,0.5);">Darme de baja</p>
    </div>
  </div>
</div>`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-accent/30 bg-accent/5" : "border-line bg-bone"}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
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
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
