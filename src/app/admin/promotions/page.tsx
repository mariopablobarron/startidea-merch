"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Scope = "ALL" | "CATEGORY" | "BRAND" | "TAG" | "PRODUCT_LIST";
type Kind = "PERCENT" | "FIXED";

type Promotion = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: Kind;
  value: number;
  scope: Scope;
  targetIds: string[];
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  badgeText: string | null;
  badgeColor: string | null;
  displayInList: boolean;
  appliedCount: number;
  viewCount: number;
  createdAt: string;
};

type ScopeOptions = {
  categories: { id: string; label: string }[];
  brands: string[];
  tags: string[];
};

type Lookup = {
  categories: Record<string, string>;
  products: Record<string, { name: string; slug: string; internalRef: string | null }>;
};

type ProductSearchHit = {
  id: string;
  name: string;
  slug: string;
  internalRef: string | null;
};

function statusOf(p: Promotion): { label: string; tone: "green" | "amber" | "gray" | "red" } {
  if (!p.active) return { label: "Pausada", tone: "gray" };
  const now = Date.now();
  const startsAt = new Date(p.startsAt).getTime();
  const endsAt = p.endsAt ? new Date(p.endsAt).getTime() : null;
  if (now < startsAt) return { label: "Programada", tone: "amber" };
  if (endsAt && now > endsAt) return { label: "Finalizada", tone: "red" };
  return { label: "Activa", tone: "green" };
}

const TONE: Record<"green" | "amber" | "gray" | "red", string> = {
  green: "bg-social/15 text-social",
  amber: "bg-amber-500/15 text-amber-700",
  gray: "bg-ink/10 text-ink/60",
  red: "bg-accent/15 text-accent-deep",
};

const SCOPE_LABEL: Record<Scope, string> = {
  ALL: "Todo el catálogo",
  CATEGORY: "Por categoría",
  BRAND: "Por marca",
  TAG: "Por etiqueta",
  PRODUCT_LIST: "Productos sueltos",
};

const SCOPE_HELP: Record<Scope, string> = {
  ALL: "Se aplica a todos los productos activos.",
  CATEGORY: "Marca una o varias categorías. Aplica a sus productos.",
  BRAND: "Marca una o varias marcas. Aplica a sus productos.",
  TAG: "Productos con esa etiqueta en marketingTags (configurable por producto).",
  PRODUCT_LIST: "Selecciona productos uno a uno (autocompletar por nombre o ref).",
};

function dtLocalNow(plus = 0): string {
  // 'YYYY-MM-DDTHH:mm' para <input type=datetime-local>
  const d = new Date(Date.now() + plus);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dtIso(s: string): string {
  // <input datetime-local> → ISO con timezone local del navegador
  return new Date(s).toISOString();
}

function dtFromIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [lookup, setLookup] = useState<Lookup>({ categories: {}, products: {} });
  const [scopeOpts, setScopeOpts] = useState<ScopeOptions>({
    categories: [],
    brands: [],
    tags: [],
  });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sc] = await Promise.all([
        fetch("/api/admin/promotions", { credentials: "include" }),
        fetch("/api/admin/promotions/scope-options", { credentials: "include" }),
      ]);
      if (!pr.ok) {
        setFeedback({ ok: false, msg: `Error ${pr.status}` });
        return;
      }
      const prData = await pr.json();
      setPromotions(prData.promotions || []);
      setLookup(prData.lookup || { categories: {}, products: {} });
      if (sc.ok) {
        const scData = await sc.json();
        setScopeOpts({
          categories: scData.categories || [],
          brands: scData.brands || [],
          tags: scData.tags || [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePromo(id: string, active: boolean) {
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)));
    await fetch(`/api/admin/promotions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active }),
    });
  }

  async function deletePromo(id: string, name: string) {
    if (!confirm(`Eliminar "${name}"? Acción irreversible.`)) return;
    const r = await fetch(`/api/admin/promotions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) {
      setFeedback({ ok: true, msg: "Promoción eliminada." });
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      setFeedback({ ok: false, msg: d.error || `Error ${r.status}` });
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Promociones
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Promociones programadas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Descuentos automáticos sobre el catálogo durante una ventana de fechas. A diferencia
              de los <Link href="/admin/coupons" className="text-accent underline">cupones</Link>{" "}
              (requieren código), las promociones se aplican solas en card, ficha y carrito.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            + Nueva promoción
          </button>
        </header>

        {feedback && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm ${
              feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
            }`}
          >
            {feedback.ok ? "✓" : "⚠"} {feedback.msg}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : promotions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone p-10 text-center">
            <p className="font-display text-lg text-ink">Aún no hay promociones</p>
            <p className="mt-2 text-sm text-ink/60">
              Crea la primera para mostrar descuentos automáticos en el catálogo.
            </p>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark"
            >
              Crear primera promoción
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Descuento</th>
                  <th className="p-3">Aplica a</th>
                  <th className="p-3">Vigencia</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Uso</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => {
                  const status = statusOf(p);
                  const discount =
                    p.kind === "PERCENT" ? `−${p.value}%` : `−${EUR.format(p.value / 100)} €`;
                  const targets = renderTargets(p, lookup, scopeOpts);
                  return (
                    <tr key={p.id} className="border-t border-line align-top hover:bg-bone-soft">
                      <td className="p-3">
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-ink/50">/{p.slug}</div>
                        {p.badgeText && (
                          <span
                            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bone"
                            style={{ background: p.badgeColor || "#E63E73" }}
                          >
                            {p.badgeText}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-display text-lg font-semibold text-accent">
                          {discount}
                        </div>
                        <div className="text-[11px] text-ink/50">{p.kind}</div>
                      </td>
                      <td className="p-3 text-xs text-ink/70">
                        <div className="font-medium text-ink">{SCOPE_LABEL[p.scope]}</div>
                        <div className="mt-1 line-clamp-2 text-ink/55">{targets}</div>
                      </td>
                      <td className="p-3 text-xs text-ink/70">
                        <div>{new Date(p.startsAt).toLocaleString("es-ES")}</div>
                        <div className="text-ink/45">
                          → {p.endsAt ? new Date(p.endsAt).toLocaleString("es-ES") : "sin fin"}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE[status.tone]}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="text-xs tabular-nums text-ink/70">
                          {p.appliedCount} usos
                        </div>
                        <div className="text-[10px] tabular-nums text-ink/40">
                          {p.viewCount} vistas
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => togglePromo(p.id, !p.active)}
                            className={`rounded-full px-2.5 py-1 text-[11px] ${
                              p.active
                                ? "bg-bone-soft text-ink/70 hover:bg-line"
                                : "bg-social/15 text-social hover:bg-social/25"
                            }`}
                            title={p.active ? "Pausar" : "Activar"}
                          >
                            {p.active ? "Pausar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="rounded-full bg-bone-soft px-2.5 py-1 text-[11px] text-ink/70 hover:bg-line"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePromo(p.id, p.name)}
                            className="rounded-full bg-accent-wash px-2.5 py-1 text-[11px] text-accent-deep hover:bg-accent/15"
                          >
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PromotionForm
          initial={editing === "new" ? null : editing}
          scopeOpts={scopeOpts}
          lookup={lookup}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setFeedback({ ok: true, msg });
            load();
          }}
        />
      )}
    </main>
  );
}

function renderTargets(p: Promotion, lookup: Lookup, opts: ScopeOptions): string {
  if (p.scope === "ALL") return "Todos los productos del catálogo";
  if (p.targetIds.length === 0) return "—";
  if (p.scope === "CATEGORY") {
    return p.targetIds
      .map((id) => lookup.categories[id] || opts.categories.find((c) => c.id === id)?.label || id)
      .join(", ");
  }
  if (p.scope === "PRODUCT_LIST") {
    return p.targetIds
      .map((id) => {
        const pr = lookup.products[id];
        return pr ? `${pr.internalRef || pr.slug} · ${pr.name}` : id;
      })
      .join(", ");
  }
  return p.targetIds.join(", ");
}

// ────────────────────────────────────────────────────────────────────────────
// Modal form
// ────────────────────────────────────────────────────────────────────────────

function PromotionForm({
  initial,
  scopeOpts,
  lookup,
  onClose,
  onSaved,
}: {
  initial: Promotion | null;
  scopeOpts: ScopeOptions;
  lookup: Lookup;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [kind, setKind] = useState<Kind>(initial?.kind || "PERCENT");
  const [value, setValue] = useState<string>(
    initial ? (initial.kind === "PERCENT" ? String(initial.value) : (initial.value / 100).toFixed(2)) : "10",
  );
  const [scope, setScope] = useState<Scope>(initial?.scope || "ALL");
  const [targetIds, setTargetIds] = useState<string[]>(initial?.targetIds || []);
  const [startsAt, setStartsAt] = useState(
    initial ? dtFromIso(initial.startsAt) : dtLocalNow(0),
  );
  const [endsAt, setEndsAt] = useState(initial?.endsAt ? dtFromIso(initial.endsAt) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [badgeText, setBadgeText] = useState(initial?.badgeText || "");
  const [badgeColor, setBadgeColor] = useState(initial?.badgeColor || "#E63E73");
  const [displayInList, setDisplayInList] = useState(initial?.displayInList ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generar slug si está vacío y editando name
  useEffect(() => {
    if (isEdit) return;
    if (!slug && name) {
      setSlug(
        name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 80),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const valueInt =
        kind === "PERCENT"
          ? parseInt(value, 10)
          : Math.round(parseFloat(value.replace(",", ".")) * 100);
      if (!Number.isFinite(valueInt) || valueInt <= 0) {
        setError("Valor inválido");
        return;
      }
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        value: valueInt,
        targetIds: scope === "ALL" ? [] : targetIds,
        startsAt: dtIso(startsAt),
        endsAt: endsAt ? dtIso(endsAt) : null,
        active,
        badgeText: badgeText.trim() || null,
        badgeColor: badgeColor || null,
        displayInList,
      };
      if (!isEdit) {
        payload.kind = kind;
        payload.scope = scope;
        if (slug.trim()) payload.slug = slug.trim();
      }
      const url = isEdit ? `/api/admin/promotions/${initial!.id}` : "/api/admin/promotions";
      const method = isEdit ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || `Error ${r.status}`);
        return;
      }
      onSaved(isEdit ? "Promoción actualizada." : "Promoción creada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-line bg-bone shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            {isEdit ? "Editar promoción" : "Nueva promoción"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink/50 hover:bg-bone-soft hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          {/* Identidad */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nombre*" help="Visible solo en admin.">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Black Friday 2026"
                maxLength={120}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FormField>
            <FormField label="Slug" help="URL-friendly. Se autogenera del nombre si lo dejas vacío.">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="black-friday-2026"
                maxLength={80}
                disabled={isEdit}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent disabled:opacity-50"
              />
            </FormField>
          </div>

          <FormField label="Descripción" help="Contexto para el equipo (no visible al cliente).">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FormField>

          {/* Descuento */}
          <div className="rounded-2xl border border-line bg-bone-soft p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/60">
              Descuento
            </p>
            <div className="flex gap-2">
              <KindButton current={kind} value="PERCENT" onClick={setKind} disabled={isEdit}>
                Porcentaje
              </KindButton>
              <KindButton current={kind} value="FIXED" onClick={setKind} disabled={isEdit}>
                Cantidad fija
              </KindButton>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-32 rounded-xl border border-line bg-bone px-3 py-2 text-right font-display text-xl font-semibold outline-none focus:border-accent"
              />
              <span className="text-lg font-medium text-ink/60">
                {kind === "PERCENT" ? "%" : "€"}
              </span>
              <span className="ml-2 text-xs text-ink/50">
                {kind === "PERCENT"
                  ? "Sobre el precio unitario en cada tramo."
                  : "Descuento absoluto en € sobre el precio unitario."}
              </span>
            </div>
          </div>

          {/* Scope */}
          <div className="rounded-2xl border border-line bg-bone-soft p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/60">
              ¿A qué productos aplica?
            </p>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as Scope);
                setTargetIds([]);
              }}
              disabled={isEdit}
              className="w-full rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="ALL">Todo el catálogo</option>
              <option value="CATEGORY">Por categoría</option>
              <option value="BRAND">Por marca</option>
              <option value="TAG">Por etiqueta de marketing</option>
              <option value="PRODUCT_LIST">Productos sueltos</option>
            </select>
            <p className="mt-1 text-[11px] text-ink/50">{SCOPE_HELP[scope]}</p>

            {scope !== "ALL" && (
              <div className="mt-3">
                <ScopeTargetPicker
                  scope={scope}
                  scopeOpts={scopeOpts}
                  initialProducts={
                    scope === "PRODUCT_LIST" && lookup.products
                      ? targetIds
                          .map((id) => {
                            const p = lookup.products[id];
                            return p ? { id, name: p.name, slug: p.slug, internalRef: p.internalRef } : null;
                          })
                          .filter(Boolean) as ProductSearchHit[]
                      : []
                  }
                  selected={targetIds}
                  onChange={setTargetIds}
                />
              </div>
            )}
          </div>

          {/* Vigencia */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Empieza*">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FormField>
            <FormField label="Termina" help="Vacío = sin fecha de fin (mientras esté activa).">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FormField>
          </div>

          {/* Badge */}
          <div className="rounded-2xl border border-line bg-bone-soft p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/60">
              Aspecto del badge en card / ficha
            </p>
            <div className="grid gap-3 sm:grid-cols-[2fr,1fr]">
              <FormField
                label="Texto del badge"
                help={`Vacío = auto (${kind === "PERCENT" ? `−${value || "?"}%` : `−${value || "?"}€`}).`}
              >
                <input
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder={`ej. ${kind === "PERCENT" ? `−${value}% BLACK FRIDAY` : "OFERTA"}`}
                  maxLength={40}
                  className="w-full rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </FormField>
              <FormField label="Color" help="Hex. Vacío = accent del tema.">
                <input
                  type="color"
                  value={badgeColor}
                  onChange={(e) => setBadgeColor(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-xl border border-line bg-bone"
                />
              </FormField>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-ink/55">Preview:</span>
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-bone"
                style={{ background: badgeColor }}
              >
                {badgeText.trim() ||
                  (kind === "PERCENT" ? `−${value || "?"}%` : `−${value || "?"}€`)}
              </span>
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-6">
            <Check
              checked={active}
              onChange={setActive}
              label="Activa"
              help="Pausa la promo sin tocar fechas."
            />
            <Check
              checked={displayInList}
              onChange={setDisplayInList}
              label="Mostrar en /promociones"
              help="Lista pública de promos."
            />
          </div>

          {error && (
            <p className="rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-bone-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-ink/60 hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear promoción"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Target picker
// ────────────────────────────────────────────────────────────────────────────

function ScopeTargetPicker({
  scope,
  scopeOpts,
  initialProducts,
  selected,
  onChange,
}: {
  scope: Scope;
  scopeOpts: ScopeOptions;
  initialProducts: ProductSearchHit[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (scope === "CATEGORY") {
    return (
      <MultiCheck
        options={scopeOpts.categories.map((c) => ({ value: c.id, label: c.label }))}
        selected={selected}
        onChange={onChange}
        emptyMsg="No hay categorías en BD"
      />
    );
  }
  if (scope === "BRAND") {
    return (
      <MultiCheck
        options={scopeOpts.brands.map((b) => ({ value: b, label: b }))}
        selected={selected}
        onChange={onChange}
        emptyMsg="No hay marcas en BD"
      />
    );
  }
  if (scope === "TAG") {
    return (
      <MultiCheck
        options={scopeOpts.tags.map((t) => ({ value: t, label: t }))}
        selected={selected}
        onChange={onChange}
        emptyMsg="No hay etiquetas marketing creadas. Crea alguna en /admin/products/[id] sección Tags."
      />
    );
  }
  if (scope === "PRODUCT_LIST") {
    return (
      <ProductSearchPicker
        initialProducts={initialProducts}
        selected={selected}
        onChange={onChange}
      />
    );
  }
  return null;
}

function MultiCheck({
  options,
  selected,
  onChange,
  emptyMsg,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyMsg?: string;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-ink/50">{emptyMsg || "Sin opciones."}</p>;
  }
  const sel = new Set(selected);
  return (
    <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-bone p-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-bone-soft"
        >
          <input
            type="checkbox"
            checked={sel.has(o.value)}
            onChange={(e) => {
              if (e.target.checked) onChange([...selected, o.value]);
              else onChange(selected.filter((v) => v !== o.value));
            }}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          <span className="text-ink/80">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function ProductSearchPicker({
  initialProducts,
  selected,
  onChange,
}: {
  initialProducts: ProductSearchHit[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductSearchHit[]>([]);
  const [chosen, setChosen] = useState<Record<string, ProductSearchHit>>(() =>
    Object.fromEntries(initialProducts.map((p) => [p.id, p])),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/admin/products?q=${encodeURIComponent(q)}&perPage=10&filter=active`,
          { credentials: "include" },
        );
        const data = await r.json();
        setResults(
          (data.items || []).map((p: ProductSearchHit) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            internalRef: p.internalRef,
          })),
        );
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function add(p: ProductSearchHit) {
    if (selected.includes(p.id)) return;
    setChosen({ ...chosen, [p.id]: p });
    onChange([...selected, p.id]);
    setQ("");
    setResults([]);
  }
  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto por nombre o ref…"
        className="w-full rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {(results.length > 0 || loading) && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-line bg-bone shadow-sm">
          {loading ? (
            <p className="px-3 py-2 text-xs text-ink/50">Buscando…</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bone-soft"
              >
                <span className="font-medium text-ink">{p.name}</span>{" "}
                <span className="font-mono text-[10px] text-ink/40">
                  {p.internalRef || p.slug}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {selected.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const p = chosen[id];
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent-deep"
              >
                <span>{p ? p.name : id}</span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="text-accent hover:text-accent-deep"
                  aria-label="Quitar"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Form primitives
// ────────────────────────────────────────────────────────────────────────────

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

function KindButton({
  current,
  value,
  onClick,
  disabled,
  children,
}: {
  current: Kind;
  value: Kind;
  onClick: (v: Kind) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(value)}
      className={`rounded-full px-4 py-1.5 text-xs font-medium ${
        active ? "bg-accent text-bone" : "border border-line bg-bone text-ink/70 hover:border-accent"
      } disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Check({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line accent-social"
      />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {help && <span className="block text-[11px] text-ink/50">{help}</span>}
      </span>
    </label>
  );
}
