"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import Link from "next/link";

type Variant = {
  id: string;
  sku: string;
  colorName: string | null;
  colorHex: string | null;
  colorGroup: string | null;
  size: string | null;
  stockQty: number;
  stockUpdatedAt: string | null;
  imageUrl: string | null;
};

type Detail = {
  id: string;
  slug: string;
  name: string;
  supplierRef: string;
  primaryImageUrl: string | null;
  syncedAt: string;
  variants: Variant[];
  category: { name: string } | null;
  override: { marketingTags: string[] } | null;
};

export default function StockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stock/${id}`, { credentials: "include" });
      const d = await res.json();
      if (res.ok) setProduct(d.product);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleRestock() {
    if (!product) return;
    const current = product.override?.marketingTags?.includes("needs-restock") ?? false;
    setUpdating(true);
    try {
      await fetch(`/api/admin/stock/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ needsRestock: !current }),
      });
      await load();
    } finally {
      setUpdating(false);
    }
  }

  if (loading || !product) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  const totalStock = product.variants.reduce((s, v) => s + v.stockQty, 0);
  const needsRestock = product.override?.marketingTags?.includes("needs-restock") ?? false;
  const variantsByColor = groupByColor(product.variants);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Operaciones · Stock
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {product.name}
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              <span className="font-mono">{product.supplierRef}</span>
              {product.category && ` · ${product.category.name}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/admin/stock"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              ← Lista stock
            </Link>
            <Link
              href={`/admin/products/${product.id}`}
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Ficha admin
            </Link>
            <a
              href={`/catalogo/${product.slug}`}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Ver pública ↗
            </a>
          </div>
        </header>

        {/* KPIs y acción restock */}
        <section className="mb-6 grid gap-3 lg:grid-cols-[1fr,auto]">
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="Stock total"
              value={totalStock.toLocaleString("es-ES")}
              color={
                totalStock === 0
                  ? "text-accent-deep"
                  : totalStock <= 20
                    ? "text-accent-deep"
                    : totalStock <= 50
                      ? "text-accent"
                      : "text-social"
              }
            />
            <Kpi label="Variantes" value={String(product.variants.length)} />
            <Kpi
              label="Última sync"
              value={
                Math.floor((Date.now() - new Date(product.syncedAt).getTime()) / 86400000) === 0
                  ? "hoy"
                  : `hace ${Math.floor((Date.now() - new Date(product.syncedAt).getTime()) / 86400000)}d`
              }
            />
          </div>
          <button
            type="button"
            onClick={toggleRestock}
            disabled={updating}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold shadow ${
              needsRestock
                ? "bg-accent text-bone hover:bg-accent-dark"
                : "border border-accent text-accent hover:bg-accent-wash"
            } disabled:opacity-40`}
          >
            {updating ? "…" : needsRestock ? "✓ Marcado para reposición" : "Marcar para reposición"}
          </button>
        </section>

        {/* Tabla de variantes por color */}
        <section className="rounded-2xl border border-line bg-bone p-5">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            Stock por variante
          </h2>

          {Object.keys(variantsByColor).length === 0 ? (
            <p className="text-xs text-ink/50">Sin variantes</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(variantsByColor).map(([color, variants]) => {
                const colorTotal = variants.reduce((s, v) => s + v.stockQty, 0);
                const colorHex = variants.find((v) => v.colorHex)?.colorHex;
                return (
                  <div key={color} className="rounded-xl border border-line bg-bone-soft p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {colorHex && (
                          <span
                            className="h-5 w-5 rounded-full border border-line"
                            style={{ backgroundColor: colorHex }}
                          />
                        )}
                        <p className="font-medium text-ink">
                          {color || "Sin color"}{" "}
                          <span className="text-xs text-ink/50">
                            ({variants.length} {variants.length === 1 ? "variante" : "variantes"})
                          </span>
                        </p>
                      </div>
                      <p
                        className={`font-display text-base font-semibold tabular-nums ${
                          colorTotal === 0 ? "text-accent-deep" : "text-ink"
                        }`}
                      >
                        {colorTotal.toLocaleString("es-ES")} uds
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
                      {variants.map((v) => (
                        <div
                          key={v.id}
                          className={`rounded-lg border px-2 py-1.5 ${
                            v.stockQty === 0
                              ? "border-accent/30 bg-accent-wash"
                              : v.stockQty <= 5
                                ? "border-accent-mist bg-accent-mist/30"
                                : "border-line bg-bone"
                          }`}
                          title={v.sku}
                        >
                          <p className="text-[10px] uppercase tracking-wider text-ink/40">
                            {v.size || "—"}
                          </p>
                          <p
                            className={`tabular-nums ${
                              v.stockQty === 0 ? "font-semibold text-accent-deep" : "text-ink"
                            }`}
                          >
                            {v.stockQty.toLocaleString("es-ES")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  color = "text-ink",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function groupByColor(variants: Variant[]): Record<string, Variant[]> {
  const groups: Record<string, Variant[]> = {};
  for (const v of variants) {
    const key = v.colorName || "Sin color";
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }
  // Ordenar cada grupo: agotados primero, luego stock asc
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.stockQty - b.stockQty);
  }
  return groups;
}
