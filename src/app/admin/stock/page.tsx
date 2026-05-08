"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

type Tier = "sold_out" | "critical" | "low" | "stale" | "all";

const TIER_LABELS: Record<Tier, string> = {
  sold_out: "Agotados",
  critical: "Crítico",
  low: "Bajo",
  stale: "Sin sync >7d",
  all: "Todos",
};

const TIER_COLORS: Record<Tier, string> = {
  sold_out: "bg-accent text-bone",
  critical: "bg-accent-wash text-accent-deep",
  low: "bg-accent-mist text-accent-deep",
  stale: "bg-bone-soft text-ink/60",
  all: "bg-bone text-ink",
};

type StockItem = {
  id: string;
  slug: string;
  name: string;
  supplierRef: string;
  primaryImageUrl: string | null;
  categoryName: string | null;
  syncedAt: string;
  totalStock: number;
  variantCount: number;
  needsRestockTag: boolean;
};

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [thresholds, setThresholds] = useState({ critical: 20, low: 50 });
  const [tier, setTier] = useState<Tier>("critical");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tier, q, limit: "100" });
      const res = await fetch(`/api/admin/stock?${params}`, { credentials: "include" });
      const d = await res.json();
      if (res.ok) {
        setItems(d.items || []);
        setCounts(d.counts || {});
        setThresholds(d.thresholds || { critical: 20, low: 50 });
      }
    } finally {
      setLoading(false);
    }
  }, [tier, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleRestock(id: string, current: boolean) {
    setUpdating(id);
    try {
      await fetch(`/api/admin/stock/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ needsRestock: !current }),
      });
      // Optimistic
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, needsRestockTag: !current } : p)),
      );
    } finally {
      setUpdating(null);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Operaciones</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Stock</h1>
          <p className="mt-2 text-sm text-ink/60">
            Productos del catálogo MidOcean ordenados por urgencia. Marca como
            &quot;needs-restock&quot; los que quieras pedir reposición — el tag aparece en la
            ficha admin del producto.
          </p>
        </header>

        {/* Tabs por tier con counts */}
        <nav className="mb-4 flex flex-wrap gap-1.5">
          {(Object.keys(TIER_LABELS) as Tier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                tier === t ? TIER_COLORS[t] : "border border-line bg-bone hover:border-accent"
              }`}
            >
              <span>{TIER_LABELS[t]}</span>
              <span
                className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                  tier === t ? "bg-bone/30 text-bone" : "bg-bone-soft text-ink/60"
                }`}
              >
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </nav>

        <div className="mb-4 flex items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o ref proveedor…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="text-[11px] text-ink/50">
            Crítico ≤ {thresholds.critical} uds · Bajo ≤ {thresholds.low} uds
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-bone p-10 text-center text-sm text-ink/60">
            🎉 Sin productos en este nivel.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3"></th>
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-right">Stock total</th>
                  <th className="p-3 text-center">Variantes</th>
                  <th className="p-3">Última sync</th>
                  <th className="p-3 text-center">Reposición</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const stockColor =
                    p.totalStock === 0
                      ? "text-accent-deep font-bold"
                      : p.totalStock <= thresholds.critical
                        ? "text-accent-deep"
                        : p.totalStock <= thresholds.low
                          ? "text-accent"
                          : "text-social";
                  const daysSinceSync = Math.floor(
                    (Date.now() - new Date(p.syncedAt).getTime()) / (24 * 60 * 60 * 1000),
                  );
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-line align-middle hover:bg-bone-soft"
                    >
                      <td className="w-14 p-2">
                        <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-bone-soft">
                          {p.primaryImageUrl && (
                            <Image
                              src={p.primaryImageUrl}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-contain p-0.5"
                              unoptimized
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-ink">{p.name}</p>
                        <p className="text-[11px] text-ink/50">
                          <span className="font-mono">{p.supplierRef}</span>
                          {p.categoryName ? ` · ${p.categoryName}` : ""}
                        </p>
                      </td>
                      <td className={`p-3 text-right tabular-nums ${stockColor}`}>
                        {p.totalStock.toLocaleString("es-ES")}
                      </td>
                      <td className="p-3 text-center text-xs text-ink/60">{p.variantCount}</td>
                      <td className="p-3 text-xs text-ink/60">
                        {daysSinceSync === 0
                          ? "hoy"
                          : daysSinceSync === 1
                            ? "ayer"
                            : `hace ${daysSinceSync}d`}
                        {daysSinceSync > 7 && (
                          <span className="ml-1 rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-deep">
                            stale
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleRestock(p.id, p.needsRestockTag)}
                          disabled={updating === p.id}
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                            p.needsRestockTag
                              ? "bg-accent text-bone"
                              : "border border-line bg-bone text-ink/60 hover:border-accent"
                          }`}
                        >
                          {p.needsRestockTag ? "✓ Marcado" : "Marcar"}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/stock/${p.id}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Ver detalle →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
