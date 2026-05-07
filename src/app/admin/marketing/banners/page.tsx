"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type BannerSlot =
  | "HOME_TOP"
  | "HOME_MID"
  | "CATALOGO_TOP"
  | "FICHA_PRODUCTO"
  | "FOOTER";

const SLOT_LABELS: Record<BannerSlot, string> = {
  HOME_TOP: "Home — bajo el hero",
  HOME_MID: "Home — entre secciones",
  CATALOGO_TOP: "Catálogo — sobre los filtros",
  FICHA_PRODUCTO: "Ficha de producto",
  FOOTER: "Footer (todas las páginas)",
};

const SLOTS: BannerSlot[] = [
  "HOME_TOP",
  "HOME_MID",
  "CATALOGO_TOP",
  "FICHA_PRODUCTO",
  "FOOTER",
];

type Banner = {
  id: string;
  slot: BannerSlot;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  bgColor: string | null;
  textColor: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  updatedAt: string;
};

const EMPTY_FORM = {
  slot: "HOME_TOP" as BannerSlot,
  title: "",
  subtitle: "",
  ctaLabel: "",
  ctaUrl: "",
  imageUrl: "",
  bgColor: "#ff6b35",
  textColor: "#faf8f4",
  active: true,
  startsAt: "",
  endsAt: "",
  priority: 0,
};

export default function BannersAdminPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/banners", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setBanners(data.banners || []);
      else setFeedback({ ok: false, msg: data.error || "Error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(b: Banner) {
    setShowCreate(false);
    setEditingId(b.id);
    setForm({
      slot: b.slot,
      title: b.title,
      subtitle: b.subtitle || "",
      ctaLabel: b.ctaLabel || "",
      ctaUrl: b.ctaUrl || "",
      imageUrl: b.imageUrl || "",
      bgColor: b.bgColor || "#ff6b35",
      textColor: b.textColor || "#faf8f4",
      active: b.active,
      startsAt: b.startsAt ? b.startsAt.slice(0, 16) : "",
      endsAt: b.endsAt ? b.endsAt.slice(0, 16) : "",
      priority: b.priority,
    });
  }

  function startCreate() {
    setEditingId(null);
    setShowCreate(true);
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setEditingId(null);
    setShowCreate(false);
    setForm(EMPTY_FORM);
    setFeedback(null);
  }

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        slot: form.slot,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        bgColor: form.bgColor.trim() || null,
        textColor: form.textColor.trim() || null,
        active: form.active,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        priority: form.priority,
      };

      const url = editingId ? `/api/admin/banners/${editingId}` : "/api/admin/banners";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error" });
      } else {
        setFeedback({ ok: true, msg: editingId ? "Actualizado" : "Creado" });
        cancel();
        await load();
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar este banner para siempre?")) return;
    await fetch(`/api/admin/banners/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  async function toggleActive(b: Banner) {
    await fetch(`/api/admin/banners/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active: !b.active }),
    });
    await load();
  }

  // Agrupar por slot
  const bySlot = SLOTS.reduce<Record<BannerSlot, Banner[]>>(
    (acc, s) => ({ ...acc, [s]: banners.filter((b) => b.slot === s) }),
    {} as Record<BannerSlot, Banner[]>,
  );

  const editing = editingId || showCreate;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · CMS
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Banners promocionales
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Crea bandas promocionales por slot. Cada slot solo muestra el banner activo
              con mayor prioridad dentro de la ventana de fechas.
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/admin/marketing/site" className="text-ink/60 hover:text-accent">
                ← Copy del Hero
              </Link>
              <Link href="/admin" className="text-ink/60 hover:text-accent">
                Panel
              </Link>
            </div>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
            >
              + Nuevo banner
            </button>
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
          <BannerForm
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={cancel}
            saving={saving}
            isEditing={!!editingId}
          />
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : (
          <div className="space-y-6">
            {SLOTS.map((slot) => (
              <section key={slot}>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
                  {SLOT_LABELS[slot]}{" "}
                  <span className="ml-1 text-ink/30">
                    ({bySlot[slot]?.length ?? 0})
                  </span>
                </h2>
                {bySlot[slot]?.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line bg-bone/50 p-4 text-xs text-ink/40">
                    Sin banners en este slot.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {bySlot[slot]!.map((b) => (
                      <BannerRow
                        key={b.id}
                        banner={b}
                        onEdit={() => startEdit(b)}
                        onToggle={() => toggleActive(b)}
                        onDelete={() => remove(b.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function BannerRow({
  banner,
  onEdit,
  onToggle,
  onDelete,
}: {
  banner: Banner;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const now = Date.now();
  const inWindow =
    (!banner.startsAt || new Date(banner.startsAt).getTime() <= now) &&
    (!banner.endsAt || new Date(banner.endsAt).getTime() >= now);
  const isLive = banner.active && inWindow;

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-bone p-4">
      {/* Mini preview */}
      <div
        className="relative h-14 w-32 flex-shrink-0 overflow-hidden rounded-lg px-3 py-2 text-[11px]"
        style={{
          backgroundColor: banner.bgColor || "#ff6b35",
          color: banner.textColor || "#faf8f4",
        }}
      >
        <p className="font-semibold leading-tight line-clamp-2">{banner.title}</p>
        {banner.ctaLabel && (
          <span className="absolute bottom-1 right-2 text-[9px] opacity-80">
            {banner.ctaLabel} →
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="font-medium text-ink">{banner.title}</p>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              isLive
                ? "bg-social/20 text-social"
                : banner.active
                  ? "bg-bone-soft text-ink/40"
                  : "bg-ink/5 text-ink/40"
            }`}
          >
            {isLive ? "Live" : banner.active ? "Programado" : "Pausado"}
          </span>
          <span className="text-[10px] text-ink/40">prioridad {banner.priority}</span>
        </div>
        {banner.subtitle && (
          <p className="mt-0.5 truncate text-xs text-ink/60">{banner.subtitle}</p>
        )}
        {(banner.startsAt || banner.endsAt) && (
          <p className="mt-0.5 text-[10px] text-ink/40">
            {banner.startsAt && `desde ${new Date(banner.startsAt).toLocaleString("es-ES")}`}
            {banner.startsAt && banner.endsAt && " · "}
            {banner.endsAt && `hasta ${new Date(banner.endsAt).toLocaleString("es-ES")}`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-line bg-bone px-2.5 py-1 hover:border-accent"
        >
          {banner.active ? "Pausar" : "Activar"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-accent px-3 py-1 font-semibold text-bone hover:bg-accent-dark"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-accent/30 px-2.5 py-1 text-accent-deep hover:bg-accent-wash"
          title="Borrar"
        >
          ×
        </button>
      </div>
    </li>
  );
}

function BannerForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isEditing,
}: {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEditing: boolean;
}) {
  function update<K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) {
    setForm({ ...form, [k]: v });
  }

  return (
    <section className="mb-8 rounded-3xl border border-accent/30 bg-bone p-6 shadow lg:p-8">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">
        {isEditing ? "Editar banner" : "Nuevo banner"}
      </h2>

      {/* Preview */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line">
        <p className="border-b border-line bg-bone-soft px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink/50">
          Preview
        </p>
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-6"
          style={{ backgroundColor: form.bgColor || "#ff6b35", color: form.textColor || "#faf8f4" }}
        >
          <div>
            <p className="font-display text-lg font-semibold leading-tight lg:text-xl">
              {form.title || "Título del banner"}
            </p>
            {form.subtitle && (
              <p className="mt-1 max-w-xl text-sm opacity-90">{form.subtitle}</p>
            )}
          </div>
          {form.ctaLabel && (
            <span
              className="rounded-full bg-white/95 px-5 py-2 text-sm font-semibold shadow"
              style={{ color: form.bgColor || "#ff6b35" }}
            >
              {form.ctaLabel} →
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Slot">
          <select
            value={form.slot}
            onChange={(e) => update("slot", e.target.value as BannerSlot)}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prioridad" help="Mayor = aparece antes si hay varios en el slot">
          <input
            type="number"
            min={0}
            max={1000}
            value={form.priority}
            onChange={(e) => update("priority", parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Título *" full>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            maxLength={160}
            required
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Subtítulo" full>
          <textarea
            value={form.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Texto botón (CTA)">
          <input
            type="text"
            value={form.ctaLabel}
            onChange={(e) => update("ctaLabel", e.target.value)}
            placeholder="Ver oferta"
            maxLength={80}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="URL botón">
          <input
            type="text"
            value={form.ctaUrl}
            onChange={(e) => update("ctaUrl", e.target.value)}
            placeholder="/catalogo o https://…"
            maxLength={500}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Imagen URL (opcional)" full>
          <input
            type="text"
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
            placeholder="https://cdn.tu-cdn.com/banner.png"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
          />
        </Field>

        <Field label="Color de fondo">
          <div className="flex gap-2">
            <input
              type="color"
              value={form.bgColor}
              onChange={(e) => update("bgColor", e.target.value)}
              className="h-9 w-14 rounded-lg border border-line"
            />
            <input
              type="text"
              value={form.bgColor}
              onChange={(e) => update("bgColor", e.target.value)}
              className="flex-1 rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
        </Field>

        <Field label="Color de texto">
          <div className="flex gap-2">
            <input
              type="color"
              value={form.textColor}
              onChange={(e) => update("textColor", e.target.value)}
              className="h-9 w-14 rounded-lg border border-line"
            />
            <input
              type="text"
              value={form.textColor}
              onChange={(e) => update("textColor", e.target.value)}
              className="flex-1 rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
        </Field>

        <Field label="Mostrar desde (opcional)">
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => update("startsAt", e.target.value)}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Mostrar hasta (opcional)">
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => update("endsAt", e.target.value)}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field full>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update("active", e.target.checked)}
              className="h-4 w-4 accent-social"
            />
            Activo (master switch — desmarca para pausar sin borrar)
          </label>
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !form.title.trim()}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
        >
          {saving ? "Guardando…" : isEditing ? "Actualizar" : "Crear banner"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
        >
          Cancelar
        </button>
      </div>
    </section>
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
