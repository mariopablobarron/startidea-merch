"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { CreativeGenerator } from "@/components/CreativeGenerator";

type Status = "DRAFT" | "REVIEW" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "ARCHIVED";
type Channel =
  | "IG" | "FB" | "LINKEDIN" | "X" | "TIKTOK" | "YOUTUBE" | "PINTEREST"
  | "EMAIL" | "WEB" | "GOOGLE_ADS" | "META_ADS" | "LINKEDIN_ADS";
type ContentType = "POST" | "STORY" | "REEL" | "CARRUSEL" | "EMAIL" | "AD" | "BLOG" | "LANDING";

const CHANNELS: Channel[] = [
  "IG", "FB", "LINKEDIN", "X", "TIKTOK", "YOUTUBE", "PINTEREST",
  "EMAIL", "WEB", "GOOGLE_ADS", "META_ADS", "LINKEDIN_ADS",
];
const TYPES: ContentType[] = ["POST", "STORY", "REEL", "CARRUSEL", "EMAIL", "AD", "BLOG", "LANDING"];

const CHANNEL_LABEL: Record<Channel, string> = {
  IG: "Instagram", FB: "Facebook", LINKEDIN: "LinkedIn", X: "X / Twitter",
  TIKTOK: "TikTok", YOUTUBE: "YouTube", PINTEREST: "Pinterest",
  EMAIL: "Email", WEB: "Web / Landing",
  GOOGLE_ADS: "Google Ads", META_ADS: "Meta Ads", LINKEDIN_ADS: "LinkedIn Ads",
};
const TYPE_LABEL: Record<ContentType, string> = {
  POST: "Post", STORY: "Story", REEL: "Reel", CARRUSEL: "Carrusel",
  EMAIL: "Email", AD: "Anuncio", BLOG: "Blog", LANDING: "Landing",
};

type Piece = {
  id: string;
  type: ContentType;
  channel: Channel;
  status: Status;
  title: string | null;
  copy: string;
  hashtags: string[];
  mentions: string[];
  creativeUrl: string | null;
  creativeBrief: string | null;
  productSlug: string | null;
  campaignId: string | null;
  campaign: { id: string; name: string; utmCampaign: string } | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type Variation = { id: string; copy: string; hashtags: string[]; notes?: string };

export default function ContentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form
  const [type, setType] = useState<ContentType>("POST");
  const [channel, setChannel] = useState<Channel>("LINKEDIN");
  const [title, setTitle] = useState("");
  const [copy, setCopy] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [creativeUrl, setCreativeUrl] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // Generador IA
  const [showGenerator, setShowGenerator] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genCta, setGenCta] = useState("");
  const [genSector, setGenSector] = useState("");
  const [genExtra, setGenExtra] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/content/${id}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.piece) {
        setPiece(data.piece);
        setType(data.piece.type);
        setChannel(data.piece.channel);
        setTitle(data.piece.title || "");
        setCopy(data.piece.copy);
        setHashtagsText((data.piece.hashtags || []).join(", "));
        setCreativeUrl(data.piece.creativeUrl || "");
        setProductSlug(data.piece.productSlug || "");
        setScheduledAt(data.piece.scheduledAt ? data.piece.scheduledAt.slice(0, 16) : "");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/content/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim() || null,
          copy: copy.trim(),
          hashtags: hashtagsText.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean),
          creativeUrl: creativeUrl.trim() || null,
          productSlug: productSlug.trim() || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado" });
        setPiece(data.piece);
      }
    } finally {
      setSaving(false);
    }
  }

  async function approve(withSchedule = false) {
    if (
      !confirm(
        withSchedule
          ? `Aprobar y programar para ${scheduledAt}?`
          : "Marcar como APPROVED? (Solo CEO)",
      )
    )
      return;
    setSaving(true);
    try {
      await save();
      const res = await fetch(`/api/admin/content/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schedule: withSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({
          ok: true,
          msg: withSchedule ? "Aprobada y programada" : "Aprobada",
        });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!genTopic.trim()) {
      setFeedback({ ok: false, msg: "Indica un tema para la IA" });
      return;
    }
    setGenerating(true);
    setVariations([]);
    try {
      const res = await fetch("/api/admin/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          channel,
          topic: genTopic,
          cta: genCta || undefined,
          sector: genSector || undefined,
          customInstructions: genExtra || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error IA" });
      } else {
        setVariations(data.variations || []);
        setFeedback({ ok: true, msg: `${(data.variations || []).length} variaciones generadas (modelo: ${data.model})` });
      }
    } finally {
      setGenerating(false);
    }
  }

  function applyVariation(v: Variation) {
    setCopy(v.copy);
    setHashtagsText(v.hashtags.join(", "));
    setShowGenerator(false);
    setFeedback({ ok: true, msg: `Variación ${v.id} aplicada. Guarda para persistir.` });
  }

  async function remove() {
    if (!confirm("¿Borrar esta pieza definitivamente? Solo CEO.")) return;
    await fetch(`/api/admin/content/${id}`, { method: "DELETE", credentials: "include" });
    window.location.href = "/admin/marketing/content";
  }

  if (loading || !piece) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const locked = piece.status === "PUBLISHED" || piece.status === "ARCHIVED";

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Content Studio
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {title || `Pieza ${piece.id.slice(0, 8)}`}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span
                className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  piece.status === "PUBLISHED"
                    ? "bg-social/20 text-social"
                    : piece.status === "SCHEDULED"
                      ? "bg-accent/20 text-accent-deep"
                      : "bg-bone text-ink/60"
                }`}
              >
                {piece.status}
              </span>
              {TYPE_LABEL[piece.type]} · {CHANNEL_LABEL[piece.channel]}
              {piece.campaign && (
                <>
                  {" · "}
                  <Link
                    href={`/admin/marketing/campaigns/${piece.campaign.id}`}
                    className="text-accent hover:underline"
                  >
                    {piece.campaign.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <Link href="/admin/marketing/content" className="text-xs text-ink/60 hover:text-accent">
            ← Lista
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
          {/* IZQUIERDA — editor */}
          <section className="space-y-4">
            {!showGenerator ? (
              <button
                type="button"
                onClick={() => setShowGenerator(true)}
                className="w-full rounded-2xl border-2 border-dashed border-accent bg-accent/5 p-5 text-left transition hover:bg-accent/10"
              >
                <p className="font-display text-base font-semibold text-ink">
                  ✨ Generar copy con IA (tono Startidea)
                </p>
                <p className="mt-1 text-xs text-ink/60">
                  3 variaciones según Manual de identidad v1.0 (frase corta, sin jerga de
                  agencia). Click para abrir el brief.
                </p>
              </button>
            ) : (
              <section className="rounded-2xl border border-accent/40 bg-bone p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-base font-semibold text-ink">
                    Brief para IA
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowGenerator(false)}
                    className="text-xs text-ink/50 hover:text-accent"
                  >
                    Ocultar
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <Field label="Tema / objetivo *" help="De qué va la pieza, en 1-3 frases">
                    <textarea
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Ej: Lanzamos línea eco de mochilas recicladas. Quiero un post LinkedIn que explique por qué importan a un Director de RRHH."
                      className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="CTA específico" help="Qué quieres que haga el lector">
                      <input
                        type="text"
                        value={genCta}
                        onChange={(e) => setGenCta(e.target.value)}
                        maxLength={120}
                        placeholder="Ej: Pedir cotización 24h"
                        className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </Field>
                    <Field label="Sector audiencia">
                      <input
                        type="text"
                        value={genSector}
                        onChange={(e) => setGenSector(e.target.value)}
                        maxLength={80}
                        placeholder="RRHH, marketing, eventos, edtech…"
                        className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </Field>
                  </div>
                  <Field label="Instrucciones extra (opcional)">
                    <textarea
                      value={genExtra}
                      onChange={(e) => setGenExtra(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="Ej: Empieza con dato, máx 800 caracteres, mencionar CEE"
                      className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating || !genTopic.trim()}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                  >
                    {generating ? "Generando 3 variaciones…" : "✨ Generar 3 variaciones"}
                  </button>
                </div>

                {variations.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
                      Variaciones generadas — elige una
                    </p>
                    {variations.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-xl border border-line bg-bone-soft p-3"
                      >
                        <p className="whitespace-pre-line text-sm text-ink">{v.copy}</p>
                        {v.hashtags.length > 0 && (
                          <p className="mt-2 text-xs text-ink/50">
                            {v.hashtags.map((h) => `#${h}`).join(" ")}
                          </p>
                        )}
                        {v.notes && (
                          <p className="mt-2 text-[10px] italic text-ink/40">
                            Por qué: {v.notes}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => applyVariation(v)}
                          className="mt-2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-bone hover:bg-accent"
                        >
                          Usar esta variación →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="space-y-3 rounded-2xl border border-line bg-bone p-5">
              <h2 className="font-display text-base font-semibold text-ink">Contenido</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de pieza">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as ContentType)}
                    disabled={locked}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Canal de publicación">
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as Channel)}
                    disabled={locked}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Título interno (opcional)">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={locked}
                  maxLength={200}
                  placeholder="Para identificar la pieza en la lista"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field label="Copy">
                <textarea
                  value={copy}
                  onChange={(e) => setCopy(e.target.value)}
                  disabled={locked}
                  rows={10}
                  maxLength={10000}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
                <p className="mt-1 text-[11px] text-ink/40">
                  {copy.length} caracteres
                </p>
              </Field>

              <Field label="Hashtags" help="Separados por coma, sin #">
                <input
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  disabled={locked}
                  placeholder="merchandising, b2b, regalosempresa"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field
                label="URL creatividad (PNG/MP4)"
                help="O genera una abajo con plantillas Startidea"
              >
                <input
                  type="text"
                  value={creativeUrl}
                  onChange={(e) => setCreativeUrl(e.target.value)}
                  disabled={locked}
                  placeholder="https://cdn… (opcional)"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              {!locked && (
                <CreativeGenerator
                  pieceId={id}
                  initialTitle={title || copy.split("\n")[0]?.slice(0, 80)}
                  onApplied={(url) => {
                    setCreativeUrl(url);
                    load();
                  }}
                />
              )}

              <Field label="Producto vinculado (slug)" help="Para atribución y carrusel /trabajos">
                <input
                  type="text"
                  value={productSlug}
                  onChange={(e) => setProductSlug(e.target.value)}
                  disabled={locked}
                  placeholder="mochila-rpet-recyclable"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>

              <Field label="Programar para">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={locked}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                />
              </Field>
            </div>

            <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-line bg-bone-soft/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8">
              <button
                type="button"
                onClick={save}
                disabled={saving || locked || !copy.trim()}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar borrador"}
              </button>
              {piece.status !== "APPROVED" && piece.status !== "SCHEDULED" && (
                <button
                  type="button"
                  onClick={() => approve(false)}
                  disabled={saving || locked || !copy.trim()}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                >
                  ✓ Aprobar (CEO)
                </button>
              )}
              {scheduledAt && piece.status !== "PUBLISHED" && (
                <button
                  type="button"
                  onClick={() => approve(true)}
                  disabled={saving || locked || !copy.trim()}
                  className="rounded-full bg-social px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-social-dark disabled:opacity-40"
                >
                  ✓ Aprobar y programar
                </button>
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={remove}
                  className="ml-auto text-xs text-accent-deep hover:underline"
                >
                  Borrar pieza
                </button>
              )}
            </div>

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

          {/* DERECHA — preview canal */}
          <section className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
              Preview · {CHANNEL_LABEL[channel]}
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              <div className="border-b border-line bg-bone-soft p-3 text-xs">
                <p className="font-medium text-ink">TodoMerchandising</p>
                <p className="text-[10px] text-ink/50">{CHANNEL_LABEL[channel]}</p>
              </div>
              {creativeUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creativeUrl} alt="" className="aspect-square w-full object-cover" />
              )}
              <div className="p-4">
                <p className="whitespace-pre-line text-sm text-ink">{copy || "(sin copy)"}</p>
                {hashtagsText && (
                  <p className="mt-3 text-xs text-[#0073b1]">
                    {hashtagsText
                      .split(",")
                      .map((h) => `#${h.trim().replace(/^#/, "")}`)
                      .filter((h) => h.length > 1)
                      .join(" ")}
                  </p>
                )}
              </div>
            </div>

            {piece.approvedBy && (
              <div className="mt-3 rounded-xl border border-line bg-bone p-3 text-xs">
                <p className="font-medium text-ink">Aprobada</p>
                <p className="mt-1 text-ink/60">
                  Por <span className="font-mono">{piece.approvedBy}</span>
                  {piece.approvedAt && ` el ${new Date(piece.approvedAt).toLocaleString("es-ES")}`}
                </p>
              </div>
            )}

            {piece.publishedAt && (
              <div className="mt-3 rounded-xl border border-line bg-social/5 p-3 text-xs">
                <p className="font-medium text-social">Publicada</p>
                <p className="mt-1 text-ink/60">
                  {new Date(piece.publishedAt).toLocaleString("es-ES")}
                </p>
              </div>
            )}
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
