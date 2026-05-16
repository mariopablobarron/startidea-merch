"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";

type Download = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  source: string | null;
  campaign: string | null;
  downloadedAt: string;
};

type Magnet = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  fileUrl: string;
  heroUrl: string | null;
  category: string | null;
  tags: string[];
  active: boolean;
  featured: boolean;
  downloadCount: number;
  downloads: Download[];
  _count: { downloads: number };
};

export default function LeadMagnetEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [magnet, setMagnet] = useState<Magnet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tagsText, setTagsText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/lead-magnets/${id}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.magnet) {
        setMagnet(data.magnet);
        setTitle(data.magnet.title);
        setDescription(data.magnet.description || "");
        setFileUrl(data.magnet.fileUrl);
        setHeroUrl(data.magnet.heroUrl || "");
        setCategory(data.magnet.category || "");
        setTagsText((data.magnet.tags || []).join(", "));
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
      const res = await fetch(`/api/admin/lead-magnets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          fileUrl: fileUrl.trim(),
          heroUrl: heroUrl.trim() || null,
          category: category.trim() || null,
          tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado" });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !magnet) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Lead Magnet
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {magnet.title}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              📥 <strong>{magnet._count.downloads}</strong> descargas totales · slug{" "}
              <code className="rounded bg-bone-soft px-1 py-0.5 font-mono">{magnet.slug}</code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/admin/marketing/lead-magnets"
              className="text-ink/60 hover:text-accent"
            >
              ← Lista
            </Link>
            <a
              href={`/recursos/${magnet.slug}`}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Ver público ↗
            </a>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
          <section className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-line bg-bone p-5">
              <h2 className="font-display text-base font-semibold text-ink">Contenido</h2>
              <Field label="Título">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="URL PDF">
                <input
                  type="text"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="URL hero">
                <input
                  type="text"
                  value={heroUrl}
                  onChange={(e) => setHeroUrl(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="Categoría">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Tags (coma)">
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
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
          </section>

          <aside>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Últimas descargas ({magnet.downloads.length})
            </h2>
            {magnet.downloads.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-bone/50 p-6 text-center text-xs text-ink/60">
                Sin descargas todavía. Promociona el recurso en blog, broadcasts y redes.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {magnet.downloads.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-2 rounded-xl border border-line bg-bone px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {d.name || d.email}
                      </p>
                      <p className="truncate text-[10px] text-ink/50">
                        {d.email}
                        {d.company && ` · ${d.company}`}
                        {d.source && ` · ${d.source}`}
                        {d.campaign && ` / ${d.campaign}`}
                      </p>
                    </div>
                    <span className="text-[10px] text-ink/40">
                      {new Date(d.downloadedAt).toLocaleDateString("es-ES")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-ink/40">
              Todos los leads se añaden a <code className="rounded bg-bone-soft px-1 py-0.5 font-mono">NewsletterSubscriber</code> y aparecen en{" "}
              <Link href="/admin/clientes" className="text-accent hover:underline">
                CRM Clientes
              </Link>
              .
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </span>
      {children}
    </label>
  );
}
