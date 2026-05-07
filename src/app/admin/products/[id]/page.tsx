"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Override = {
  customName: string | null;
  customDescription: string | null;
  customFromPriceCents: number | null;
  marginPct: number | null;
  extraImages: string[];
  featured: boolean;
  hidden: boolean;
  marketingTags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  internalNotes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  supplierRef: string;
  shortDescription: string | null;
  longDescription: string | null;
  enhancedShortDescription: string | null;
  primaryImageUrl: string | null;
  fromPriceCents: number | null;
  category: { name: string } | null;
  override: Override | null;
};

export default function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form state — empieza con valores del override existente
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPriceEur, setCustomPriceEur] = useState(""); // input en EUR, convertimos a cents
  const [marginPct, setMarginPct] = useState("");
  const [extraImagesText, setExtraImagesText] = useState("");
  const [featured, setFeatured] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [marketingTagsText, setMarketingTagsText] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${id}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error" });
        return;
      }
      setProduct(data.product);
      const ov = data.product.override;
      setCustomName(ov?.customName || "");
      setCustomDescription(ov?.customDescription || "");
      setCustomPriceEur(
        ov?.customFromPriceCents != null ? (ov.customFromPriceCents / 100).toFixed(2) : "",
      );
      setMarginPct(ov?.marginPct != null ? String(ov.marginPct) : "");
      setExtraImagesText((ov?.extraImages || []).join("\n"));
      setFeatured(ov?.featured ?? false);
      setHidden(ov?.hidden ?? false);
      setMarketingTagsText((ov?.marketingTags || []).join(", "));
      setMetaTitle(ov?.metaTitle || "");
      setMetaDescription(ov?.metaDescription || "");
      setInternalNotes(ov?.internalNotes || "");
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
      const payload = {
        customName: customName.trim() || null,
        customDescription: customDescription.trim() || null,
        customFromPriceCents:
          customPriceEur.trim() === ""
            ? null
            : Math.round(parseFloat(customPriceEur.replace(",", ".")) * 100),
        marginPct: marginPct.trim() === "" ? null : parseInt(marginPct, 10),
        extraImages: extraImagesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        featured,
        hidden,
        marketingTags: marketingTagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        internalNotes: internalNotes.trim() || null,
      };

      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          ok: false,
          msg: data.error || `Error (${res.status})`,
        });
      } else {
        setFeedback({
          ok: true,
          msg: "Guardado. Cambios live al recargar la ficha pública.",
        });
        await load();
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (
      !confirm(
        "Eliminar TODO el override (nombre, precio, descripción, imágenes, tags, SEO)? El producto vuelve a usar los datos del proveedor.",
      )
    ) {
      return;
    }
    await fetch(`/api/admin/products/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  }

  if (loading || !product) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const hasOverride =
    !!product.override &&
    (product.override.customName ||
      product.override.customFromPriceCents != null ||
      product.override.marginPct != null ||
      product.override.customDescription ||
      product.override.featured ||
      product.override.hidden ||
      (product.override.marketingTags?.length ?? 0) > 0 ||
      (product.override.extraImages?.length ?? 0) > 0);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · Producto
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {customName || product.name}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span className="font-mono">{product.supplierRef}</span> ·{" "}
              {product.category?.name || "Sin categoría"}
              {product.brand ? ` · ${product.brand}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/admin/products"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              ← Lista
            </Link>
            <a
              href={`/catalogo/${product.slug}`}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Ver ficha pública ↗
            </a>
            {hasOverride && (
              <button
                type="button"
                onClick={resetAll}
                className="rounded-full border border-accent/30 bg-accent-wash px-3 py-1.5 text-accent-deep hover:bg-accent/10"
              >
                Reset override
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
          {/* Imagen + datos del proveedor */}
          <aside className="space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-bone">
              {product.primaryImageUrl ? (
                <Image
                  src={product.primaryImageUrl}
                  alt=""
                  fill
                  sizes="(max-width:1024px) 100vw, 33vw"
                  className="object-contain p-4"
                  unoptimized
                />
              ) : (
                <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-bone p-4 text-xs">
              <p className="mb-2 font-medium uppercase tracking-wider text-ink/60">
                Datos del proveedor
              </p>
              <dl className="space-y-1 text-ink/70">
                <Row label="Nombre original" value={product.name} />
                <Row
                  label="Precio desde original"
                  value={
                    product.fromPriceCents != null
                      ? `${EUR.format(product.fromPriceCents / 100)} €`
                      : "—"
                  }
                />
                {product.shortDescription && (
                  <Row label="Descripción corta" value={product.shortDescription} multiline />
                )}
              </dl>
            </div>

            {product.override?.updatedAt && (
              <p className="text-[10px] text-ink/40">
                Última edición:{" "}
                {new Date(product.override.updatedAt).toLocaleString("es-ES")}
                {product.override.updatedBy ? ` por ${product.override.updatedBy}` : ""}
              </p>
            )}
          </aside>

          {/* Form override */}
          <section className="space-y-5 rounded-3xl border border-line bg-bone p-6 lg:p-8">
            <Section title="Visibilidad y promoción">
              <div className="flex gap-6">
                <CheckboxField
                  checked={featured}
                  onChange={setFeatured}
                  label="Destacar en home"
                  help="Aparece en sección de destacados"
                />
                <CheckboxField
                  checked={hidden}
                  onChange={setHidden}
                  label="Ocultar del catálogo"
                  help="No aparecerá en /catalogo"
                  danger
                />
              </div>
            </Section>

            <Section title="Override de copy y precio">
              <FormField label="Nombre custom" help="Vacío = usa el del proveedor">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={product.name}
                  maxLength={220}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>

              <FormField
                label="Descripción custom"
                help="Sustituye a la del proveedor en la ficha pública"
              >
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder={product.longDescription || product.shortDescription || ""}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label="Precio desde override (€)"
                  help={`Original: ${product.fromPriceCents != null ? EUR.format(product.fromPriceCents / 100) : "—"} €`}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customPriceEur}
                    onChange={(e) => setCustomPriceEur(e.target.value)}
                    placeholder="ej. 1.85"
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </FormField>
                <FormField
                  label="o margen %"
                  help="Alternativa al override directo (ej. 35 = +35% sobre original)"
                >
                  <input
                    type="number"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                    placeholder="ej. 35"
                    min={-50}
                    max={500}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </FormField>
              </div>
            </Section>

            <Section title="Imágenes y tags">
              <FormField
                label="URLs de imágenes extra"
                help="Una por línea. CDN externo o /uploads/. Se mostrarán en la galería tras la imagen del proveedor."
              >
                <textarea
                  value={extraImagesText}
                  onChange={(e) => setExtraImagesText(e.target.value)}
                  rows={3}
                  placeholder="https://cdn.tu-cdn.com/foto1.jpg&#10;https://cdn.tu-cdn.com/foto2.jpg"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </FormField>

              <FormField
                label="Tags de marketing"
                help="Separados por coma. Ej: best-seller, eco, novedad"
              >
                <input
                  type="text"
                  value={marketingTagsText}
                  onChange={(e) => setMarketingTagsText(e.target.value)}
                  placeholder="best-seller, eco, novedad"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>
            </Section>

            <Section title="SEO">
              <FormField label="Meta title">
                <input
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  maxLength={160}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>
              <FormField label="Meta description">
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  maxLength={320}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>
            </Section>

            <Section title="Notas internas">
              <FormField label="Solo el equipo lo ve">
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Recordatorios, acuerdos con cliente, observaciones técnicas…"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>
            </Section>

            <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-line bg-bone-soft/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar override"}
              </button>
              <button
                type="button"
                onClick={load}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Descartar
              </button>
              {feedback && (
                <p
                  className={`flex-1 truncate text-xs ${
                    feedback.ok ? "text-social" : "text-accent-deep"
                  }`}
                >
                  {feedback.ok ? "✓" : "⚠"} {feedback.msg}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormField({
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

function CheckboxField({
  checked,
  onChange,
  label,
  help,
  danger = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
  danger?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-0.5 h-4 w-4 rounded border-line ${
          danger ? "accent-accent" : "accent-social"
        }`}
      />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {help && <span className="block text-[11px] text-ink/50">{help}</span>}
      </span>
    </label>
  );
}

function Row({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink/40">{label}</dt>
      <dd className={`text-ink/80 ${multiline ? "line-clamp-3" : "truncate"}`}>{value}</dd>
    </div>
  );
}
