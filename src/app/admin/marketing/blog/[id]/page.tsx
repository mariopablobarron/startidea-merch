"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";

type Status = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  heroUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywordTarget: string | null;
  intent: string;
  tags: string[];
  status: Status;
  publishedAt: string | null;
  author: string | null;
  createdBy: string | null;
  schemaJson: { faq?: Array<{ q: string; a: string }> } | null;
};

export default function BlogEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [keywordTarget, setKeywordTarget] = useState("");
  const [tagsText, setTagsText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blog/${id}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.post) {
        setPost(data.post);
        setTitle(data.post.title);
        setSlug(data.post.slug);
        setExcerpt(data.post.excerpt || "");
        setBodyMd(data.post.bodyMd);
        setHeroUrl(data.post.heroUrl || "");
        setMetaTitle(data.post.metaTitle || "");
        setMetaDescription(data.post.metaDescription || "");
        setKeywordTarget(data.post.keywordTarget || "");
        setTagsText((data.post.tags || []).join(", "));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(newStatus?: Status) {
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        bodyMd: bodyMd.trim(),
        heroUrl: heroUrl.trim() || null,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        keywordTarget: keywordTarget.trim() || null,
        tags: tagsText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      };
      if (newStatus) payload.status = newStatus;

      const res = await fetch(`/api/admin/blog/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({
          ok: true,
          msg: newStatus === "PUBLISHED" ? "Publicado · ya visible en /blog" : "Guardado",
        });
        setPost(data.post);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Borrar este artículo definitivamente? Solo CEO.")) return;
    await fetch(`/api/admin/blog/${id}`, { method: "DELETE", credentials: "include" });
    window.location.href = "/admin/marketing/blog";
  }

  if (loading || !post) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const wordCount = bodyMd.split(/\s+/).filter(Boolean).length;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Blog · Editor
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {title || `Post ${post.id.slice(0, 8)}`}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span
                className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  post.status === "PUBLISHED"
                    ? "bg-social/20 text-social"
                    : "bg-bone-soft text-ink/60"
                }`}
              >
                {post.status}
              </span>
              {wordCount.toLocaleString("es-ES")} palabras · /{post.slug}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/admin/marketing/blog" className="text-ink/60 hover:text-accent">
              ← Lista
            </Link>
            {post.status === "PUBLISHED" && (
              <a
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noopener"
                className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              >
                Ver público ↗
              </a>
            )}
          </div>
        </header>

        <div className="grid gap-4">
          <section className="grid gap-3 rounded-2xl border border-line bg-bone p-5 lg:grid-cols-2">
            <Field label="Title (H1) *" full>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Slug">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={80}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </Field>
            <Field label="Keyword target SEO">
              <input
                type="text"
                value={keywordTarget}
                onChange={(e) => setKeywordTarget(e.target.value)}
                maxLength={160}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Hero image URL" full>
              <input
                type="text"
                value={heroUrl}
                onChange={(e) => setHeroUrl(e.target.value)}
                placeholder="https://cdn… (16:9 ideal)"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </Field>
            <Field label="Excerpt (resumen)" full>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                maxLength={400}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Tags (separados por coma)" full>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="merchandising, b2b, sostenibilidad"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
          </section>

          <section className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">
              Body (Markdown)
            </h2>
            <p className="mb-3 text-[11px] text-ink/50">
              Soporta # H1, ## H2, ### H3, listas, tablas, links, **bold**, *italic*. La sección final
              debe ser ## Preguntas frecuentes con cada pregunta como ###.
            </p>
            <textarea
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={28}
              maxLength={80_000}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-ink/40">
              {wordCount.toLocaleString("es-ES")} palabras · {bodyMd.length} caracteres
            </p>
          </section>

          <section className="grid gap-3 rounded-2xl border border-line bg-bone p-5 lg:grid-cols-2">
            <h2 className="font-display text-base font-semibold text-ink lg:col-span-2">
              SEO meta tags
            </h2>
            <Field label="Meta title" help="≤60 caracteres recomendado">
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={160}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-[10px] text-ink/40">{metaTitle.length}/160</p>
            </Field>
            <Field label="Meta description" help="120-155 caracteres recomendado">
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={2}
                maxLength={320}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-[10px] text-ink/40">{metaDescription.length}/320</p>
            </Field>

            {/* Preview SERP */}
            <div className="lg:col-span-2">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-ink/50">
                Preview en Google
              </p>
              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs text-[#202124]">
                  merchandising.hubstartidea.es/blog/{slug}
                </p>
                <p className="mt-0.5 text-lg font-medium text-[#1a0dab]">
                  {metaTitle || title || "(falta title)"}
                </p>
                <p className="mt-0.5 text-sm text-[#4d5156]">
                  {metaDescription || excerpt || "(falta description)"}
                </p>
              </div>
            </div>
          </section>

          {post.schemaJson?.faq && post.schemaJson.faq.length > 0 && (
            <section className="rounded-2xl border border-line bg-bone p-5">
              <h2 className="mb-2 font-display text-base font-semibold text-ink">
                FAQ schema.org ({post.schemaJson.faq.length})
              </h2>
              <ul className="space-y-2 text-sm">
                {post.schemaJson.faq.map((f, i) => (
                  <li key={i} className="rounded-xl bg-bone-soft p-3">
                    <p className="font-medium text-ink">Q: {f.q}</p>
                    <p className="mt-1 text-ink/70">A: {f.a}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-line bg-bone-soft/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8">
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || !title.trim() || !bodyMd.trim()}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            {post.status !== "PUBLISHED" && (
              <button
                type="button"
                onClick={() => save("PUBLISHED")}
                disabled={saving || !title.trim() || !bodyMd.trim()}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                ✓ Publicar
              </button>
            )}
            {post.status === "PUBLISHED" && (
              <button
                type="button"
                onClick={() => save("ARCHIVED")}
                disabled={saving}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Archivar
              </button>
            )}
            <button
              type="button"
              onClick={remove}
              className="ml-auto text-xs text-accent-deep hover:underline"
            >
              Borrar
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
      </div>
    </main>
  );
}

function Field({
  label,
  help,
  full = false,
  children,
}: {
  label: string;
  help?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "lg:col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
