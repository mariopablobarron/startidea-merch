"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Status = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
type Intent = "INFORMATIONAL" | "TRANSACTIONAL" | "NAVIGATIONAL" | "COMMERCIAL";

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: "bg-bone-soft text-ink/50",
  REVIEW: "bg-accent-mist text-accent-deep",
  PUBLISHED: "bg-social/20 text-social",
  ARCHIVED: "bg-ink/5 text-ink/40",
};

const INTENT_LABEL: Record<Intent, string> = {
  INFORMATIONAL: "Informativo (guía)",
  TRANSACTIONAL: "Transaccional (compra)",
  NAVIGATIONAL: "Navegacional (marca)",
  COMMERCIAL: "Comercial (comparativa)",
};

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  keywordTarget: string | null;
  intent: Intent;
  status: Status;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

const INITIAL_BRIEF = {
  topic: "",
  keywordTarget: "",
  intent: "INFORMATIONAL" as Intent,
  targetWordCount: 1800,
  internalLinks: "https://merchandising.startidea.es/catalogo",
  customInstructions: "",
};

export default function BlogAdminPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status | "">("");
  const [q, setQ] = useState("");

  const [showGenerator, setShowGenerator] = useState(false);
  const [brief, setBrief] = useState(INITIAL_BRIEF);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        perPage: "50",
      });
      const res = await fetch(`/api/admin/blog?${params}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    if (!brief.topic.trim() || !brief.keywordTarget.trim()) {
      setFeedback({ ok: false, msg: "Tema y keyword son obligatorios" });
      return;
    }
    setGenerating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          topic: brief.topic,
          keywordTarget: brief.keywordTarget,
          intent: brief.intent,
          targetWordCount: brief.targetWordCount,
          internalLinks: brief.internalLinks
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          customInstructions: brief.customInstructions || undefined,
          persist: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error generando" });
      } else {
        setFeedback({
          ok: true,
          msg: `Generado y guardado como DRAFT. Modelo: ${data.model}`,
        });
        setBrief(INITIAL_BRIEF);
        setShowGenerator(false);
        await load();
        // Abrir editor del recién creado
        if (data.post?.id) {
          window.location.href = `/admin/marketing/blog/${data.post.id}`;
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Blog SEO
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Artículos del blog
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              {total} {total === 1 ? "artículo" : "artículos"} · Long-form SEO 1500-2500 palabras
              en tono Startidea, con schema.org Article + FAQPage. Publicados en{" "}
              <a href="/blog" target="_blank" rel="noopener" className="text-accent hover:underline">
                /blog
              </a>
              .
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/admin/marketing/content" className="text-ink/60 hover:text-accent">
                ← Content Studio
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGenerator(!showGenerator)}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            {showGenerator ? "Cerrar generador" : "✨ Generar con IA"}
          </button>
        </header>

        {showGenerator && (
          <section className="mb-6 rounded-3xl border border-accent/40 bg-bone p-6 shadow lg:p-8">
            <h2 className="font-display text-lg font-semibold text-ink">
              Brief para IA · Long-form SEO
            </h2>
            <p className="mt-1 text-xs text-ink/60">
              La IA genera un artículo completo (~1800 palabras) con title, meta tags, body
              Markdown estructurado (H2/H3/listas/CTA) y FAQ schema.org. Tono Startidea
              estricto. Coste ~10 céntimos por artículo.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Field label="Tema central *" full>
                <textarea
                  value={brief.topic}
                  onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
                  rows={3}
                  maxLength={500}
                  placeholder="Ej: Cómo elegir la cantidad mínima óptima al pedir merch corporativo para un evento"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Keyword target *">
                <input
                  type="text"
                  value={brief.keywordTarget}
                  onChange={(e) => setBrief({ ...brief, keywordTarget: e.target.value })}
                  maxLength={160}
                  placeholder="cantidad mínima merchandising empresa"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Intent">
                <select
                  value={brief.intent}
                  onChange={(e) => setBrief({ ...brief, intent: e.target.value as Intent })}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {(Object.keys(INTENT_LABEL) as Intent[]).map((i) => (
                    <option key={i} value={i}>
                      {INTENT_LABEL[i]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Palabras objetivo">
                <input
                  type="number"
                  min={500}
                  max={4000}
                  step={100}
                  value={brief.targetWordCount}
                  onChange={(e) =>
                    setBrief({ ...brief, targetWordCount: parseInt(e.target.value, 10) || 1800 })
                  }
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field
                label="Internal links (1 URL por línea)"
                help="La IA los inserta en contexto natural"
                full
              >
                <textarea
                  value={brief.internalLinks}
                  onChange={(e) => setBrief({ ...brief, internalLinks: e.target.value })}
                  rows={3}
                  placeholder="https://merchandising.startidea.es/catalogo"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="Instrucciones extra (opcional)" full>
                <textarea
                  value={brief.customInstructions}
                  onChange={(e) => setBrief({ ...brief, customInstructions: e.target.value })}
                  rows={2}
                  maxLength={2000}
                  placeholder="Ej: Mencionar caso real con cliente del sector eventos. Incluir tabla comparativa."
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={generating || !brief.topic.trim() || !brief.keywordTarget.trim()}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {generating ? "Generando (~30s)…" : "✨ Generar artículo completo"}
              </button>
              <button
                type="button"
                onClick={() => setBrief(INITIAL_BRIEF)}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Reset
              </button>
            </div>
          </section>
        )}

        {feedback && (
          <p
            className={`mb-4 rounded-lg px-3 py-2 text-xs ${
              feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
            }`}
          >
            {feedback.ok ? "✓" : "⚠"} {feedback.msg}
          </p>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título / keyword…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | "")}
            className="rounded-full border border-line bg-bone px-3 py-2 text-xs"
          >
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="REVIEW">En revisión</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="ARCHIVED">Archivado</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">📝</p>
            <p className="mt-3 font-display text-lg text-ink">Sin artículos todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Genera tu primer artículo SEO con IA en menos de 30 segundos.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Artículo</th>
                  <th className="p-3">Keyword</th>
                  <th className="p-3 text-center">Intent</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-t border-line align-middle hover:bg-bone-soft">
                    <td className="p-3">
                      <p className="font-medium text-ink line-clamp-1">{p.title}</p>
                      {p.excerpt && (
                        <p className="line-clamp-1 text-[11px] text-ink/50">{p.excerpt}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink/70">{p.keywordTarget || "—"}</td>
                    <td className="p-3 text-center text-[10px]">
                      <span className="rounded-full bg-bone-soft px-1.5 py-0.5 text-ink/60">
                        {p.intent.slice(0, 4)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[p.status]}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-ink/60">
                      {p.publishedAt
                        ? `Pub ${new Date(p.publishedAt).toLocaleDateString("es-ES")}`
                        : new Date(p.createdAt).toLocaleDateString("es-ES")}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2 text-xs">
                        {p.status === "PUBLISHED" && (
                          <a
                            href={`/blog/${p.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="text-ink/60 hover:text-accent"
                          >
                            Ver ↗
                          </a>
                        )}
                        <Link
                          href={`/admin/marketing/blog/${p.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          Editar →
                        </Link>
                      </div>
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
