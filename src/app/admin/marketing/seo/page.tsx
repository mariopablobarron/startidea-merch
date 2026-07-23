"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const KNOWN_PATHS: Array<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/catalogo", label: "Catálogo (listado)" },
  { path: "/recomendador", label: "Recomendador IA" },
  { path: "/cotizar", label: "Cotizar" },
  { path: "/sobre", label: "Sobre" },
  { path: "/ayuda", label: "Ayuda" },
  { path: "/clientes", label: "Portal cliente (login)" },
  { path: "/sectores", label: "Por sectores" },
  { path: "/privacidad", label: "Privacidad" },
  { path: "/aviso-legal", label: "Aviso legal" },
];

type SeoRow = {
  path: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  robots: string | null;
  schemaJson: unknown | null;
  updatedAt: string;
  updatedBy: string | null;
};

const EMPTY_FORM = {
  path: "/",
  title: "",
  description: "",
  ogImage: "",
  robots: "",
  schemaJson: "",
};

export default function SeoEditorPage() {
  const [items, setItems] = useState<SeoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seo", { credentials: "include" });
      const d = await res.json();
      if (res.ok) setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(path: string) {
    const existing = items.find((i) => i.path === path);
    setEditing(true);
    setFeedback(null);
    setForm({
      path,
      title: existing?.title || "",
      description: existing?.description || "",
      ogImage: existing?.ogImage || "",
      robots: existing?.robots || "",
      schemaJson: existing?.schemaJson ? JSON.stringify(existing.schemaJson, null, 2) : "",
    });
  }

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      let schemaJsonParsed: unknown = null;
      if (form.schemaJson.trim()) {
        try {
          schemaJsonParsed = JSON.parse(form.schemaJson);
        } catch {
          setFeedback({ ok: false, msg: "JSON inválido en schema.org" });
          setSaving(false);
          return;
        }
      }
      const res = await fetch("/api/admin/seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path: form.path.trim(),
          title: form.title.trim() || null,
          description: form.description.trim() || null,
          ogImage: form.ogImage.trim() || null,
          robots: form.robots.trim() || null,
          schemaJson: schemaJsonParsed,
        }),
      });
      const d = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: d.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado" });
        await load();
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function reset(path: string) {
    if (!confirm(`Borrar override SEO de "${path}"? La página volverá a usar sus defaults.`)) return;
    await fetch(`/api/admin/seo?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  }

  // Path único: combinamos KNOWN + custom existentes
  const allPaths = Array.from(
    new Set([...KNOWN_PATHS.map((p) => p.path), ...items.map((i) => i.path)]),
  );

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · SEO
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Editor SEO por página
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Override de title, meta description, OG image, robots y schema.org por
              página individual. Si una página no tiene override, usa sus defaults.
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/admin/marketing/site" className="text-ink/60 hover:text-accent">
                Copy
              </Link>
              <Link href="/admin/marketing/banners" className="text-ink/60 hover:text-accent">
                Banners
              </Link>
              <Link href="/admin/marketing/broadcasts" className="text-ink/60 hover:text-accent">
                Emails
              </Link>
            </div>
          </div>
        </header>

        {feedback && (
          <p
            className={`mb-4 rounded-lg px-3 py-2 text-xs ${
              feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
            }`}
          >
            {feedback.ok ? "✓" : "⚠"} {feedback.msg}
          </p>
        )}

        {editing && (
          <section className="mb-6 rounded-3xl border border-accent/30 bg-bone p-6 lg:p-8">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">
              Editar SEO de <code className="text-accent">{form.path}</code>
            </h2>

            <div className="space-y-4">
              <Field label="Path">
                <input
                  type="text"
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  placeholder="/"
                />
              </Field>

              <Field
                label="Title"
                help={`${form.title.length}/60 — Google muestra ~60 chars`}
              >
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={160}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="Merchandising corporativo personalizado · TodoMerchandising"
                />
              </Field>

              <Field
                label="Description"
                help={`${form.description.length}/160 — Google muestra ~160 chars`}
              >
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  maxLength={320}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="Más de 2.000 productos personalizables con tu logo. Cotización en 24h…"
                />
              </Field>

              <Field
                label="OG Image URL (1200×630)"
                help="Aparece en preview de WhatsApp, Twitter, LinkedIn cuando comparten el link"
              >
                <input
                  type="url"
                  value={form.ogImage}
                  onChange={(e) => setForm({ ...form, ogImage: e.target.value })}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                  placeholder="https://merchandising.startidea.es/og/home.png"
                />
              </Field>

              <Field
                label="Robots"
                help={`Default: index,follow. Pon "noindex,follow" para ocultar de Google.`}
              >
                <input
                  type="text"
                  value={form.robots}
                  onChange={(e) => setForm({ ...form, robots: e.target.value })}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  placeholder="index,follow"
                />
              </Field>

              <Field
                label="Schema.org adicional (JSON-LD)"
                help="Avanzado: schema custom (Organization, Service, BreadcrumbList…). Inyecta en el head."
              >
                <textarea
                  value={form.schemaJson}
                  onChange={(e) => setForm({ ...form, schemaJson: e.target.value })}
                  rows={6}
                  className="block w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                  placeholder='{"@context":"https://schema.org","@type":"Service","name":"…"}'
                />
              </Field>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFeedback(null);
                  }}
                  className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
                >
                  Cancelar
                </button>
                <a
                  href={form.path}
                  target="_blank"
                  rel="noopener"
                  className="ml-auto text-xs text-accent hover:underline"
                >
                  Ver página ↗
                </a>
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Path</th>
                  <th className="p-3">Title override</th>
                  <th className="p-3 text-center">Editado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {allPaths.map((path) => {
                  const row = items.find((i) => i.path === path);
                  const known = KNOWN_PATHS.find((k) => k.path === path);
                  return (
                    <tr key={path} className="border-t border-line hover:bg-bone-soft">
                      <td className="p-3">
                        <p className="font-mono text-ink">{path}</p>
                        {known && <p className="text-[10px] text-ink/50">{known.label}</p>}
                      </td>
                      <td className="p-3 text-xs text-ink/70">
                        {row?.title ? (
                          <span className="line-clamp-2">{row.title}</span>
                        ) : (
                          <span className="text-ink/30">— sin override (usa default)</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {row ? (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
                            Editado
                          </span>
                        ) : (
                          <span className="text-[10px] text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(path)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {row ? "Editar" : "Crear"} →
                        </button>
                        {row && (
                          <button
                            type="button"
                            onClick={() => reset(path)}
                            className="ml-3 text-xs text-ink/40 hover:text-accent-deep"
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11px] text-ink/50">
          ℹ️ Para fichas de producto individuales, edita meta title/description en{" "}
          <Link href="/admin/products" className="text-accent hover:underline">
            Productos
          </Link>{" "}
          → seleccionar producto → sección SEO.
        </p>
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
