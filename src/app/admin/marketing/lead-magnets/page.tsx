"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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
  createdAt: string;
  _count: { downloads: number };
};

const INITIAL = {
  title: "",
  description: "",
  fileUrl: "",
  heroUrl: "",
  category: "guía",
  tags: "",
  featured: true,
};

export default function LeadMagnetsAdminPage() {
  const [items, setItems] = useState<Magnet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/lead-magnets", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/lead-magnets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          fileUrl: form.fileUrl.trim(),
          heroUrl: form.heroUrl.trim() || null,
          category: form.category.trim() || null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          featured: form.featured,
        }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Recurso creado y publicado en /recursos" });
        setForm(INITIAL);
        setShowForm(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, field: "active" | "featured", value: boolean) {
    setItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
    );
    await fetch(`/api/admin/lead-magnets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar recurso (y todos sus tracking de descargas)?")) return;
    await fetch(`/api/admin/lead-magnets/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Lead generation
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Recursos descargables
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              PDFs / guías / plantillas que el visitante descarga a cambio de email.
              Aparecen en{" "}
              <a
                href="/recursos"
                target="_blank"
                rel="noopener"
                className="text-accent hover:underline"
              >
                /recursos
              </a>
              . Cada descarga se registra con UTMs y suscribe a la newsletter
              (idempotente, GDPR-friendly).
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/admin/marketing/content" className="text-ink/60 hover:text-accent">
                Content Studio
              </Link>
              <Link href="/admin/marketing/blog" className="text-ink/60 hover:text-accent">
                Blog
              </Link>
              <Link href="/admin/marketing/broadcasts" className="text-ink/60 hover:text-accent">
                Broadcasts
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            {showForm ? "Cerrar" : "+ Nuevo recurso"}
          </button>
        </header>

        {showForm && (
          <section className="mb-6 rounded-3xl border border-accent/40 bg-bone p-6 shadow lg:p-8">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Subir nuevo recurso
            </h2>
            <p className="mb-4 text-xs text-ink/60">
              Aloja el PDF en tu CDN (S3, Cloudinary, Drive público…) y pega aquí la URL
              absoluta. La imagen hero es opcional pero recomendada (4:3, 1200×900).
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Título *">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Guía: 7 errores al pedir merchandising corporativo"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Categoría">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option>guía</option>
                  <option>plantilla</option>
                  <option>checklist</option>
                  <option>case-study</option>
                  <option>tool</option>
                  <option>ebook</option>
                </select>
              </Field>
              <Field label="URL del PDF *" full>
                <input
                  type="text"
                  value={form.fileUrl}
                  onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                  placeholder="https://cdn.startidea.es/recursos/guia-merch.pdf"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="Hero image URL (4:3)" full>
                <input
                  type="text"
                  value={form.heroUrl}
                  onChange={(e) => setForm({ ...form, heroUrl: e.target.value })}
                  placeholder="https://cdn.startidea.es/recursos/guia-merch-cover.jpg"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="Descripción" full>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  maxLength={2000}
                  placeholder="Qué aprenderá el lector. 2-4 frases. Sin jerga."
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Tags (separados por coma)" full>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="cantidades-mínimas, rrhh, eventos"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field full>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    className="h-4 w-4 accent-accent"
                  />
                  Destacar en /recursos (aparece primero)
                </label>
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={create}
                disabled={saving || !form.title.trim() || !form.fileUrl.trim()}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Creando…" : "Crear y publicar"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Cancelar
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

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">📥</p>
            <p className="mt-3 font-display text-lg text-ink">Sin recursos todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Empieza con una guía PDF generada con IA o un caso de estudio en formato
              checklist. Es el mejor canal de captación cuando hay tráfico SEO.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => (
              <li key={m.id} className="rounded-2xl border border-line bg-bone p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="font-display text-lg font-semibold text-ink">
                        {m.title}
                      </h2>
                      {m.category && (
                        <span className="rounded-full bg-bone-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink/60">
                          {m.category}
                        </span>
                      )}
                      {m.featured && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
                          ★ Destacado
                        </span>
                      )}
                      {!m.active && (
                        <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink/40">
                          Inactivo
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-ink/60">{m.description}</p>
                    )}
                    <p className="mt-2 text-[11px] text-ink/40">
                      📥 {m.downloadCount} descargas · slug{" "}
                      <code className="rounded bg-bone-soft px-1 py-0.5 font-mono">{m.slug}</code>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <a
                      href={`/recursos/${m.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="text-ink/60 hover:text-accent"
                    >
                      Ver ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => toggle(m.id, "featured", !m.featured)}
                      className={`rounded-full px-2.5 py-1 ${m.featured ? "bg-accent/15 text-accent-deep" : "border border-line bg-bone-soft text-ink/60"}`}
                    >
                      {m.featured ? "★" : "Destacar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(m.id, "active", !m.active)}
                      className={`rounded-full px-2.5 py-1 ${m.active ? "bg-social/15 text-social" : "border border-line bg-bone-soft text-ink/60"}`}
                    >
                      {m.active ? "Activo" : "Activar"}
                    </button>
                    <Link
                      href={`/admin/marketing/lead-magnets/${m.id}`}
                      className="rounded-full bg-accent px-3 py-1 font-semibold text-bone hover:bg-accent-dark"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="rounded-full border border-accent/30 px-2 py-1 text-accent-deep hover:bg-accent-wash"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  full = false,
  children,
}: {
  label?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "lg:col-span-2" : undefined}>
      {label && (
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
