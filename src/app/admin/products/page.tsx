"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Override = {
  customName: string | null;
  customFromPriceCents: number | null;
  marginPct: number | null;
  featured: boolean;
  hidden: boolean;
  marketingTags: string[];
  extraImages: string[];
  updatedAt: string;
} | null;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  supplierRef: string;
  internalRef: string | null;
  primaryImageUrl: string | null;
  fromPriceCents: number | null;
  active: boolean;
  category: { name: string } | null;
  override: Override;
};

type Filter = "all" | "active" | "featured" | "hidden" | "edited";
const FILTER_LABELS: Record<Filter, string> = {
  all: "Todos",
  active: "Activos",
  featured: "Destacados",
  hidden: "Ocultos",
  edited: "Editados",
};

export default function AdminProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bulk selection — set de productIds marcados
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        filter,
        page: String(page),
        perPage: "30",
      });
      const res = await fetch(`/api/admin/products?${params}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [q, filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(id: string, field: "featured" | "hidden", value: boolean) {
    // Optimistic update
    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              override: {
                customName: p.override?.customName ?? null,
                customFromPriceCents: p.override?.customFromPriceCents ?? null,
                marginPct: p.override?.marginPct ?? null,
                featured: field === "featured" ? value : p.override?.featured ?? false,
                hidden: field === "hidden" ? value : p.override?.hidden ?? false,
                marketingTags: p.override?.marketingTags ?? [],
                extraImages: p.override?.extraImages ?? [],
                updatedAt: new Date().toISOString(),
              },
            }
          : p,
      ),
    );
    try {
      await fetch(`/api/admin/products/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
    } catch {
      // En error, revertir recargando
      load();
    }
  }

  // ─── Bulk: aplicar margen % a múltiples productos ─────────────────────────
  async function applyBulkMargin(marginPct: number | null) {
    if (selected.size === 0) return;
    const label =
      marginPct == null
        ? `Quitar margen % de ${selected.size} productos seleccionados? (vuelven al precio del proveedor)`
        : `Aplicar margen ${marginPct >= 0 ? "+" : ""}${marginPct}% a ${selected.size} productos seleccionados?`;
    if (!confirm(label)) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await fetch("/api/admin/products/bulk-margin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productIds: [...selected],
          marginPct,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setBulkMsg(`⚠ ${data.error || `Error ${r.status}`}`);
        return;
      }
      setBulkMsg(
        `✓ ${data.updated} producto${data.updated === 1 ? "" : "s"} actualizado${data.updated === 1 ? "" : "s"}` +
          (data.missing?.length ? ` (${data.missing.length} no encontrados)` : ""),
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      setBulkMsg(`⚠ ${e instanceof Error ? e.message : "Error de red"}`);
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const allOnPage = items.every((p) => prev.has(p.id));
      const next = new Set(prev);
      if (allOnPage) {
        items.forEach((p) => next.delete(p.id));
      } else {
        items.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  // ─── Edición rápida inline del precio ─────────────────────────────────────
  // Permite editar customFromPriceCents directamente desde la lista sin
  // entrar al detalle. Si el input se deja vacío, se elimina el override
  // (vuelve al precio original).
  async function savePrice(id: string, priceEurStr: string): Promise<string | null> {
    const trimmed = priceEurStr.trim().replace(",", ".");
    let customFromPriceCents: number | null = null;
    if (trimmed) {
      const num = parseFloat(trimmed);
      if (!Number.isFinite(num) || num < 0) return "Precio inválido";
      customFromPriceCents = Math.round(num * 100);
    }
    // Optimistic update
    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              override: {
                customName: p.override?.customName ?? null,
                customFromPriceCents,
                marginPct: p.override?.marginPct ?? null,
                featured: p.override?.featured ?? false,
                hidden: p.override?.hidden ?? false,
                marketingTags: p.override?.marketingTags ?? [],
                extraImages: p.override?.extraImages ?? [],
                updatedAt: new Date().toISOString(),
              },
            }
          : p,
      ),
    );
    try {
      const r = await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customFromPriceCents }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        load();
        return d.error || `Error ${r.status}`;
      }
      return null;
    } catch (e) {
      load();
      return e instanceof Error ? e.message : "Error de red";
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Marketing</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Productos</h1>
          <p className="mt-2 text-sm text-ink/60">
            {total} {total === 1 ? "producto" : "productos"} · Edita precio, descripción, imágenes
            y destaca/oculta del catálogo público.
          </p>
        </header>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o ref…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-1.5">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setFilter(k);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filter === k
                    ? "bg-accent text-bone"
                    : "border border-line bg-bone hover:border-accent"
                }`}
              >
                {FILTER_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
        )}

        {/* Barra de acción bulk — solo aparece cuando hay selección */}
        {selected.size > 0 && (
          <div className="sticky top-12 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-wash px-4 py-2.5 shadow-sm">
            <span className="text-sm font-medium text-accent-deep">
              {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-ink/60 hover:text-ink"
            >
              Limpiar
            </button>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
              <span className="text-xs text-ink/55">Aplicar margen:</span>
              <BulkMarginButton onClick={() => applyBulkMargin(-20)} disabled={bulkBusy}>
                −20%
              </BulkMarginButton>
              <BulkMarginButton onClick={() => applyBulkMargin(-10)} disabled={bulkBusy}>
                −10%
              </BulkMarginButton>
              <BulkMarginButton onClick={() => applyBulkMargin(20)} disabled={bulkBusy}>
                +20%
              </BulkMarginButton>
              <BulkMarginButton onClick={() => applyBulkMargin(35)} disabled={bulkBusy}>
                +35%
              </BulkMarginButton>
              <BulkMarginButton onClick={() => applyBulkMargin(60)} disabled={bulkBusy}>
                +60%
              </BulkMarginButton>
              <BulkMarginCustom onApply={applyBulkMargin} disabled={bulkBusy} />
              <button
                type="button"
                onClick={() => applyBulkMargin(null)}
                disabled={bulkBusy}
                className="ml-2 rounded-full border border-line bg-bone px-3 py-1 text-xs text-ink/60 hover:border-accent hover:text-ink disabled:opacity-50"
                title="Vuelve al precio original del proveedor"
              >
                Reset
              </button>
            </div>
            {bulkMsg && (
              <p
                className={`w-full text-xs ${bulkMsg.startsWith("✓") ? "text-social" : "text-accent-deep"}`}
              >
                {bulkMsg}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-bone p-10 text-center text-sm text-ink/60">
            Sin resultados.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                  <tr>
                    <th className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && items.every((p) => selected.has(p.id))}
                        ref={(el) => {
                          if (el) {
                            const some = items.some((p) => selected.has(p.id));
                            const all = items.every((p) => selected.has(p.id));
                            el.indeterminate = some && !all;
                          }
                        }}
                        onChange={toggleAllOnPage}
                        className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                        title="Seleccionar todos en esta página"
                      />
                    </th>
                    <th className="p-3"></th>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Precio</th>
                    <th className="p-3 text-center">Destacado</th>
                    <th className="p-3 text-center">Oculto</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const ov = p.override;
                    const displayName = ov?.customName || p.name;
                    const isOverridden = !!ov && (
                      ov.customName ||
                      ov.customFromPriceCents != null ||
                      ov.marginPct != null ||
                      ov.featured ||
                      ov.hidden ||
                      ov.marketingTags.length > 0 ||
                      ov.extraImages.length > 0
                    );

                    return (
                      <tr
                        key={p.id}
                        className={`border-t border-line align-middle hover:bg-bone-soft ${
                          selected.has(p.id) ? "bg-accent/5" : ""
                        }`}
                      >
                        <td className="w-10 p-2 text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelected(p.id)}
                            className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                            aria-label={`Seleccionar ${p.name}`}
                          />
                        </td>
                        <td className="w-16 p-2">
                          <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-bone-soft">
                            {p.primaryImageUrl && (
                              <Image
                                src={p.primaryImageUrl}
                                alt=""
                                fill
                                sizes="48px"
                                className="object-contain p-1"
                                unoptimized
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-ink">{displayName}</div>
                          <div className="text-[11px] text-ink/50">
                            <span className="font-mono text-accent" title="Referencia pública Startidea (la que ven los clientes)">
                              {p.internalRef || "—"}
                            </span>
                            <span className="mx-1.5 text-ink/30">·</span>
                            <span className="font-mono" title="Referencia proveedor (interna, NUNCA mostrar al cliente)">
                              {p.supplierRef}
                            </span>
                            {isOverridden && (
                              <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-deep">
                                Editado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-ink/60">{p.category?.name || "—"}</td>
                        <td className="p-3 text-right">
                          <PriceCell
                            originalCents={p.fromPriceCents}
                            overrideCents={ov?.customFromPriceCents ?? null}
                            onSave={(val) => savePrice(p.id, val)}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <ToggleSwitch
                            checked={ov?.featured ?? false}
                            onChange={(v) => toggle(p.id, "featured", v)}
                            label="Destacar"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <ToggleSwitch
                            checked={ov?.hidden ?? false}
                            onChange={(v) => toggle(p.id, "hidden", v)}
                            label="Ocultar"
                            danger
                          />
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Editar →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs">
                <p className="text-ink/60">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-full border border-line bg-bone px-3 py-1.5 disabled:opacity-30"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-full border border-line bg-bone px-3 py-1.5 disabled:opacity-30"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  danger = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  danger?: boolean;
}) {
  const onColor = danger ? "bg-accent" : "bg-social";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        checked ? onColor : "bg-line"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-bone shadow transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function BulkMarginButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-bone px-3 py-1 text-xs font-semibold text-ink hover:bg-accent hover:text-bone disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BulkMarginCustom({
  onApply,
  disabled,
}: {
  onApply: (pct: number) => void;
  disabled: boolean;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="±%"
        min={-90}
        max={500}
        className="w-16 rounded-full border border-line bg-bone px-2 py-1 text-center text-xs outline-none focus:border-accent"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => {
          const n = parseInt(val, 10);
          if (Number.isFinite(n)) onApply(n);
        }}
        disabled={disabled || !val.trim()}
        className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        Aplicar
      </button>
    </div>
  );
}

/**
 * Celda de precio editable inline.
 *   - Vista normal: muestra el precio efectivo (override si existe, original
 *     si no). Si hay override, el original aparece tachado al lado en gris.
 *   - Click → modo edición con input. Enter o blur guarda. Esc cancela.
 *   - Vaciar el input + guardar → elimina el override (vuelve al original).
 */
function PriceCell({
  originalCents,
  overrideCents,
  onSave,
}: {
  originalCents: number | null;
  overrideCents: number | null;
  onSave: (val: string) => Promise<string | null>;
}) {
  const display = overrideCents ?? originalCents;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startEdit() {
    setVal(overrideCents != null ? (overrideCents / 100).toFixed(2) : "");
    setErr(null);
    setEditing(true);
  }

  async function commit() {
    setSaving(true);
    const error = await onSave(val);
    setSaving(false);
    if (error) {
      setErr(error);
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="inline-flex items-center justify-end gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setErr(null);
            }
          }}
          autoFocus
          placeholder={
            originalCents != null ? (originalCents / 100).toFixed(2) : "0.00"
          }
          className="w-20 rounded border border-accent bg-bone px-2 py-1 text-right text-sm tabular-nums outline-none"
          disabled={saving}
        />
        <span className="text-xs text-ink/60">€</span>
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-social hover:bg-social/10 disabled:opacity-50"
          title="Guardar (Enter)"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setErr(null);
          }}
          disabled={saving}
          className="rounded px-1.5 py-0.5 text-[10px] text-ink/50 hover:bg-bone-soft"
          title="Cancelar (Esc)"
        >
          ✕
        </button>
        {err && (
          <span className="ml-1 text-[10px] text-accent" title={err}>
            ⚠
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group inline-flex items-baseline justify-end gap-1 rounded px-1.5 py-0.5 text-right hover:bg-accent/5"
      title="Click para editar precio"
    >
      {display != null ? (
        <span
          className={`font-medium tabular-nums ${
            overrideCents != null ? "text-accent" : "text-ink"
          }`}
        >
          {EUR.format(display / 100)} €
        </span>
      ) : (
        <span className="text-ink/30">—</span>
      )}
      {overrideCents != null && originalCents != null && overrideCents !== originalCents && (
        <span className="font-mono text-[10px] tabular-nums text-ink/35 line-through">
          {EUR.format(originalCents / 100)}€
        </span>
      )}
      <span className="invisible text-[10px] text-ink/40 group-hover:visible">✎</span>
    </button>
  );
}
