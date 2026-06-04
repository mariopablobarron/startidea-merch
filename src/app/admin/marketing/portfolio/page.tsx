"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Item = {
  id: string;
  imageUrl: string;
  title: string;
  description: string | null;
  clientName: string | null;
  productSlug: string | null;
  sector: string | null;
  featured: boolean;
  active: boolean;
  order: number;
  createdAt: string;
};

const EMPTY = {
  imageUrl: "",
  title: "",
  description: "",
  clientName: "",
  productSlug: "",
  sector: "",
  featured: true,
  active: true,
  order: 0,
};

export default function PortfolioAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/portfolio", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(it: Item) {
    setCreating(false);
    setEditingId(it.id);
    setForm({
      imageUrl: it.imageUrl,
      title: it.title,
      description: it.description || "",
      clientName: it.clientName || "",
      productSlug: it.productSlug || "",
      sector: it.sector || "",
      featured: it.featured,
      active: it.active,
      order: it.order,
    });
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(EMPTY);
  }

  function cancel() {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY);
    setFeedback(null);
  }

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        imageUrl: form.imageUrl.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        clientName: form.clientName.trim() || null,
        productSlug: form.productSlug.trim() || null,
        sector: form.sector.trim() || null,
        featured: form.featured,
        active: form.active,
        order: form.order,
      };
      const url = editingId ? `/api/admin/portfolio/${editingId}` : "/api/admin/portfolio";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: editingId ? "Actualizado" : "Creado" });
        cancel();
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar este trabajo del portfolio?")) return;
    await fetch(`/api/admin/portfolio/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  async function seed30() {
    if (
      !confirm(
        "¿Insertar ejemplos históricos (2016-2026) extraídos del Gmail de Mario?\n\n" +
          "• Es idempotente: si ya hay items con esos títulos no los duplica.\n" +
          "• Todos los items se insertan ACTIVOS y con el nombre real del cliente.\n" +
          "• Las imágenes son placeholders. Reemplázalas con foto real con el botón 'Subir foto' del editor.\n" +
          "• Puedes destacar / desactivar / borrar / reordenar libremente desde aquí.",
      )
    )
      return;
    setSeeding(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/portfolio/seed-30", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        setFeedback({
          ok: true,
          msg:
            data.inserted > 0
              ? `Insertados ${data.inserted} ejemplos (${data.skipped} ya existían). Total en BD: ${data.totalInDb}.`
              : `Ya estaban los 30 (idempotente). Total en BD: ${data.totalInDb}.`,
        });
        await load();
      }
    } finally {
      setSeeding(false);
    }
  }

  async function toggleField(id: string, field: "featured" | "active") {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    await fetch(`/api/admin/portfolio/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: !it[field] }),
    });
    await load();
  }

  // ─── Reordenar con flecha: ↑ resta 15 al order, ↓ suma 15. El backend ordena ASC. ──
  async function move(id: string, delta: number) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const newOrder = Math.max(0, Math.min(9999, it.order + delta));
    if (newOrder === it.order) return;
    // Optimistic update — UI responde antes de la red
    setItems((curr) =>
      [...curr]
        .map((i) => (i.id === id ? { ...i, order: newOrder } : i))
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    );
    await fetch(`/api/admin/portfolio/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ order: newOrder }),
    });
    await load();
  }

  // ─── Subir foto desde el editor: multipart → URL CDN local /files/portfolio/X ──
  async function uploadImage(file: File) {
    setSaving(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/portfolio/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error al subir" });
      } else {
        const fullUrl = data.url.startsWith("http")
          ? data.url
          : `${window.location.origin}${data.url}`;
        setForm((f) => ({ ...f, imageUrl: fullUrl }));
        setFeedback({ ok: true, msg: `Imagen subida (${Math.round(data.size / 1024)} KB).` });
      }
    } finally {
      setSaving(false);
    }
  }

  const editing = editingId || creating;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Portfolio
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Trabajos realizados
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Galería de pedidos reales con logo aplicado. Aparecen en{" "}
              <Link href="/trabajos" className="text-accent hover:underline" target="_blank">
                /trabajos
              </Link>{" "}
              y los marcados como destacados también en la home.
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
              <Link href="/admin/marketing/seo" className="text-ink/60 hover:text-accent">
                SEO
              </Link>
            </div>
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={seed30}
                disabled={seeding}
                title="Inserta ejemplos históricos (2016-2026) del Gmail. Idempotente: solo añade los que falten."
                className="rounded-full border border-line bg-bone-soft px-4 py-2.5 text-xs font-semibold text-ink/75 hover:border-accent hover:text-ink disabled:opacity-50"
              >
                {seeding ? "Insertando…" : "📥 Poblar ejemplos históricos"}
              </button>
              <button
                type="button"
                onClick={startCreate}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
              >
                + Añadir trabajo
              </button>
            </div>
          )}
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
          <section className="mb-8 rounded-3xl border border-accent/30 bg-bone p-6 shadow lg:p-8">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">
              {editingId ? "Editar trabajo" : "Nuevo trabajo"}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="URL imagen *" full help="Sube una foto del taller, un boceto PDF de Cifra o pega una URL absoluta de tu CDN.">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://cdn.tu-cdn.com/pedido-acme.jpg"
                    className="flex-1 min-w-[200px] rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                  />
                  <label
                    className={`cursor-pointer rounded-full border border-accent/40 bg-accent-wash px-3 py-2 text-xs font-semibold text-accent-deep hover:bg-accent/15 ${
                      saving ? "opacity-50 pointer-events-none" : ""
                    }`}
                    title="Sube PNG, JPG, SVG, WebP o PDF (máx 8 MB)"
                  >
                    📤 Subir foto
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void uploadImage(file);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
                {form.imageUrl && (
                  <div className="mt-2 relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-line bg-bone-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
              </Field>
              <Field label="Título *">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="200 sudaderas para Acme Corp"
                  maxLength={200}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Cliente">
                <input
                  type="text"
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="Acme Corp · Eventos 2026"
                  maxLength={120}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Sector / Tag">
                <input
                  type="text"
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  placeholder="eventos, rrhh, marketing, edtech…"
                  maxLength={40}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Slug del producto (opcional)" help="Para enlazar la card a /catalogo/[slug]">
                <input
                  type="text"
                  value={form.productSlug}
                  onChange={(e) => setForm({ ...form, productSlug: e.target.value })}
                  placeholder="sudadera-comfort-fit-bordada"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </Field>
              <Field label="Descripción" full>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  maxLength={2000}
                  placeholder="200 uds bordado en pecho · serigrafía espalda · entrega en 12 días"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Orden" help="Menor = aparece antes">
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 0 })}
                  min={0}
                  max={9999}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field full>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                      className="h-4 w-4 accent-accent"
                    />
                    Destacar en home (aparece en la sección &quot;Trabajos realizados&quot; de portada)
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="h-4 w-4 accent-social"
                    />
                    Activo (visible en la web)
                  </label>
                </div>
              </Field>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.imageUrl.trim() || !form.title.trim()}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : editingId ? "Actualizar" : "Crear"}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">📷</p>
            <p className="mt-3 font-display text-lg text-ink">Sin trabajos en portfolio todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Pide foto al cliente al entregar o haz mockup propio. Es el trust signal más
              importante en B2B.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <li
                key={it.id}
                className={`rounded-2xl border bg-bone p-3 ${
                  it.active ? "border-line" : "border-dashed border-line opacity-50"
                }`}
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-bone-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.imageUrl} alt={it.title} className="h-full w-full object-cover" />
                  <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                    {it.featured && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone">
                        Home
                      </span>
                    )}
                    {it.sector && (
                      <span className="rounded-full bg-bone/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink/70 backdrop-blur">
                        {it.sector}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-medium text-ink">{it.title}</p>
                {it.clientName && (
                  <p className="text-[11px] text-ink/50">{it.clientName}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <div className="flex items-center gap-0.5 rounded-full border border-line bg-bone-soft">
                    <button
                      type="button"
                      onClick={() => move(it.id, -15)}
                      title="Subir en el orden"
                      aria-label="Subir"
                      className="rounded-l-full px-2 py-0.5 text-ink/70 hover:bg-bone hover:text-ink"
                    >
                      ↑
                    </button>
                    <span className="px-1 text-[9px] font-mono text-ink/40">{it.order}</span>
                    <button
                      type="button"
                      onClick={() => move(it.id, 15)}
                      title="Bajar en el orden"
                      aria-label="Bajar"
                      className="rounded-r-full px-2 py-0.5 text-ink/70 hover:bg-bone hover:text-ink"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleField(it.id, "featured")}
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      it.featured
                        ? "bg-accent/15 text-accent-deep"
                        : "border border-line bg-bone-soft text-ink/60"
                    }`}
                    title="Mostrar en home"
                  >
                    {it.featured ? "★ Home" : "Home"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleField(it.id, "active")}
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      it.active
                        ? "bg-social/15 text-social"
                        : "border border-line bg-bone-soft text-ink/60"
                    }`}
                  >
                    {it.active ? "Activo" : "Inactivo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(it)}
                    className="rounded-full bg-accent px-2 py-0.5 font-semibold text-bone hover:bg-accent-dark"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="rounded-full border border-accent/30 px-2 py-0.5 text-accent-deep hover:bg-accent-wash"
                    title="Borrar"
                  >
                    ×
                  </button>
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
  help,
  full = false,
  children,
}: {
  label?: string;
  help?: string;
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
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
