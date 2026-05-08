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

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Marketing</p>
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
                    const displayPrice = ov?.customFromPriceCents ?? p.fromPriceCents;
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
                      <tr key={p.id} className="border-t border-line align-middle hover:bg-bone-soft">
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
                          {displayPrice != null ? (
                            <span className="font-medium tabular-nums">
                              {EUR.format(displayPrice / 100)} €
                              {ov?.customFromPriceCents != null && (
                                <span className="ml-1 text-[10px] text-accent">·</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-ink/30">—</span>
                          )}
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
