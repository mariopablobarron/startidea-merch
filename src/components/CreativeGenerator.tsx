"use client";

import { useState } from "react";

type Template = "post-square" | "story-vertical" | "linkedin-landscape" | "email-header";
type Variant = "magenta-bg" | "crema-bg";

const TEMPLATES: Array<{ id: Template; label: string; dim: string; suggested: string }> = [
  { id: "post-square", label: "Post cuadrado 1080×1080", dim: "1:1", suggested: "Instagram, Facebook, LinkedIn" },
  { id: "story-vertical", label: "Story vertical 1080×1920", dim: "9:16", suggested: "IG Story, TikTok, Reels" },
  { id: "linkedin-landscape", label: "LinkedIn header 1200×628", dim: "1.91:1", suggested: "LinkedIn post horizontal" },
  { id: "email-header", label: "Email header 1200×400", dim: "3:1", suggested: "Cabecera broadcasts" },
];

const SITE_URL = "https://merchandising.hubstartidea.es";

/**
 * Generador de creatividad embebido en el editor de pieza.
 * Renderiza preview en tiempo real (URL del endpoint /api/og/creative)
 * y al pulsar "Aplicar a pieza" persiste creativeUrl en BD.
 */
export function CreativeGenerator({
  pieceId,
  initialTitle,
  initialProductImage,
  onApplied,
}: {
  pieceId: string;
  initialTitle?: string;
  initialProductImage?: string | null;
  onApplied?: (creativeUrl: string) => void;
}) {
  const [template, setTemplate] = useState<Template>("post-square");
  const [variant, setVariant] = useState<Variant>("magenta-bg");
  const [title, setTitle] = useState(initialTitle || "Damos forma a ideas que ya estaban ahí");
  const [subtitle, setSubtitle] = useState("");
  const [cta, setCta] = useState("");
  const [productImageUrl, setProductImageUrl] = useState(initialProductImage || "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [bumpKey, setBumpKey] = useState(0);

  // URL preview live (sin guardar)
  const previewUrl = `${SITE_URL}/api/og/creative?${new URLSearchParams({
    template,
    variant,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(cta ? { cta } : {}),
    ...(productImageUrl ? { product: productImageUrl } : {}),
    v: String(bumpKey),
  })}`;

  async function apply() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/content/${pieceId}/generate-creative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          template,
          variant,
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          cta: cta.trim() || null,
          productImageUrl: productImageUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        setFeedback({ ok: true, msg: "Creatividad aplicada a la pieza" });
        onApplied?.(data.creativeUrl);
      }
    } finally {
      setSaving(false);
    }
  }

  // Aspect ratio del preview según template
  const previewAspect: Record<Template, string> = {
    "post-square": "aspect-square",
    "story-vertical": "aspect-[9/16]",
    "linkedin-landscape": "aspect-[1200/628]",
    "email-header": "aspect-[3/1]",
  };

  return (
    <section className="rounded-2xl border border-line bg-bone p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-ink">
          🎨 Generar creatividad
        </h3>
        <span className="text-[10px] text-ink/40">
          Plantillas paleta Startidea v1.0
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,1.2fr]">
        {/* Form */}
        <div className="space-y-3">
          <Field label="Formato">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as Template)}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.suggested}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Variante de color">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVariant("magenta-bg")}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  variant === "magenta-bg"
                    ? "border-accent bg-accent text-bone"
                    : "border-line bg-bone-soft text-ink/70 hover:border-accent"
                }`}
              >
                Magenta sobre crema (texto)
              </button>
              <button
                type="button"
                onClick={() => setVariant("crema-bg")}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  variant === "crema-bg"
                    ? "border-accent bg-accent text-bone"
                    : "border-line bg-bone-soft text-ink/70 hover:border-accent"
                }`}
              >
                Crema (fondo) con acento magenta
              </button>
            </div>
          </Field>

          <Field label="Título">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              maxLength={200}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="Subtítulo (opcional)">
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={300}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="CTA (botón)" help="Ej: Ver catálogo · Pedir cotización">
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              maxLength={60}
              placeholder="Ver catálogo"
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="Imagen producto (opcional)" help="URL absoluta del PNG/JPG">
            <input
              type="text"
              value={productImageUrl}
              onChange={(e) => setProductImageUrl(e.target.value)}
              placeholder="https://cdn.midocean.com/..."
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </Field>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBumpKey((k) => k + 1)}
              className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs hover:border-accent"
              title="Refrescar preview"
            >
              ↻ Preview
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={saving || !title.trim()}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
            >
              {saving ? "Aplicando…" : "Aplicar a la pieza"}
            </button>
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
        </div>

        {/* Preview */}
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-ink/50">
            Preview {DIMENSIONS_LABEL[template]}
          </p>
          <div
            className={`relative overflow-hidden rounded-xl border border-line bg-bone-soft ${previewAspect[template]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={bumpKey}
              src={previewUrl}
              alt="Preview creatividad"
              className="h-full w-full object-cover"
            />
          </div>
          <p className="mt-2 text-[10px] text-ink/40">
            Endpoint: /api/og/creative · regenerable on-demand
          </p>
        </div>
      </div>
    </section>
  );
}

const DIMENSIONS_LABEL: Record<Template, string> = {
  "post-square": "1080×1080 px",
  "story-vertical": "1080×1920 px",
  "linkedin-landscape": "1200×628 px",
  "email-header": "1200×400 px",
};

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
