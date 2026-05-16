"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Segment = "ENTERPRISE" | "MIDMARKET" | "STARTUP" | "ONE_OFF" | "PARTNER" | "CHURNED";

const SEGMENT_LABELS: Record<Segment, string> = {
  ENTERPRISE: "Enterprise",
  MIDMARKET: "Midmarket",
  STARTUP: "Startup",
  ONE_OFF: "Puntual",
  PARTNER: "Partner",
  CHURNED: "Churned",
};

const SEGMENT_COLORS: Record<Segment, string> = {
  ENTERPRISE: "bg-accent text-bone",
  MIDMARKET: "bg-accent/15 text-accent-deep",
  STARTUP: "bg-social/20 text-social",
  ONE_OFF: "bg-bone-soft text-ink/60",
  PARTNER: "bg-accent-mist text-accent-deep",
  CHURNED: "bg-ink/5 text-ink/40",
};

type Customer = {
  email: string;
  name: string;
  company: string | null;
  cartCount: number;
  paidCount: number;
  ltvCents: number;
  lastCartAt: string | null;
  lastPaidAt: string | null;
  hasUser: boolean;
  tags: string[];
  segment: Segment | null;
};

type Sort = "ltv" | "recent" | "name";

export default function CustomersListPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [sort, setSort] = useState<Sort>("ltv");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        segment,
        sort,
        page: String(page),
        perPage: "50",
      });
      const res = await fetch(`/api/admin/customers?${params}`, { credentials: "include" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Error");
        return;
      }
      setItems(d.items || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [q, segment, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">CRM</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Clientes</h1>
          <p className="mt-2 text-sm text-ink/60">
            {total} {total === 1 ? "cliente" : "clientes"} (agregado por email único). Editables:
            tags, notas internas, segmentación.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por email, nombre o empresa…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPage(1);
            }}
            className="rounded-full border border-line bg-bone px-3 py-2 text-xs outline-none focus:border-accent"
          >
            <option value="">Todos los segmentos</option>
            {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {(["ltv", "recent", "name"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  sort === s
                    ? "bg-accent text-bone"
                    : "border border-line bg-bone hover:border-accent"
                }`}
              >
                {s === "ltv" ? "Por LTV" : s === "recent" ? "Más recientes" : "A–Z"}
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
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-center">Segmento</th>
                    <th className="p-3 text-center">Tags</th>
                    <th className="p-3 text-right">Cestas</th>
                    <th className="p-3 text-right">Pagados</th>
                    <th className="p-3 text-right">LTV</th>
                    <th className="p-3">Último</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.email} className="border-t border-line align-middle hover:bg-bone-soft">
                      <td className="p-3">
                        <p className="font-medium text-ink">
                          {c.name}
                          {c.hasUser && (
                            <span
                              className="ml-1.5 inline-block rounded-full bg-social/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-social"
                              title="Tiene cuenta de cliente activa"
                            >
                              cuenta
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-ink/50">
                          {c.email}
                          {c.company ? ` · ${c.company}` : ""}
                        </p>
                      </td>
                      <td className="p-3 text-center">
                        {c.segment ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEGMENT_COLORS[c.segment]}`}
                          >
                            {SEGMENT_LABELS[c.segment]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {c.tags.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {c.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-line bg-bone-soft px-1.5 py-0.5 text-[10px] text-ink/70"
                              >
                                {t}
                              </span>
                            ))}
                            {c.tags.length > 3 && (
                              <span className="text-[10px] text-ink/40">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs text-ink/70">
                        {c.cartCount}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs text-social">
                        {c.paidCount}
                      </td>
                      <td className="p-3 text-right">
                        {c.ltvCents > 0 ? (
                          <span className="font-semibold tabular-nums text-ink">
                            {EUR.format(c.ltvCents / 100)}
                          </span>
                        ) : (
                          <span className="text-xs text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-ink/60">
                        {c.lastPaidAt
                          ? `Pago ${new Date(c.lastPaidAt).toLocaleDateString("es-ES")}`
                          : c.lastCartAt
                            ? `Cesta ${new Date(c.lastCartAt).toLocaleDateString("es-ES")}`
                            : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/clientes/${encodeURIComponent(c.email)}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
