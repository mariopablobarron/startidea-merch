"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Item = {
  id: string;
  brief: string;
  budget: number | null;
  quantity: number | null;
  ecoOnly: boolean;
  needsClarification: boolean | null;
  fallback: boolean;
  recommendedSlugs: string[];
  summary: string | null;
  modelUsed: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  ip: string | null;
  createdAt: string;
};

type Resp = {
  ok: true;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  items: Item[];
  kpis: {
    total30d: number;
    fallback30d: number;
    clarification30d: number;
    fallbackPct: number;
    clarifPct: number;
  };
  topRecommended: Array<{ slug: string; count: number }>;
};

type Filter = "all" | "fallback" | "clarification";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Todas",
  fallback: "Con error",
  clarification: "Necesitaron aclaración",
};

export default function RecomendadorAdminPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(90);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        filter,
        page: String(page),
        days: String(days),
        perPage: "50",
      });
      const res = await fetch(`/api/admin/recomendador?${params}`, { credentials: "include" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Error");
        return;
      }
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [q, filter, page, days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Marketing</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Consultas al Recomendador IA
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Cada brief que envían los visitantes al recomendador queda registrado aquí. Útil
            para detectar qué pide la gente, qué falta en catálogo y mejorar el prompt.
          </p>
        </header>

        {/* KPIs últimos 30d */}
        {data && (
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label="Consultas 30d"
              value={data.kpis.total30d.toLocaleString("es-ES")}
              color="text-ink"
            />
            <Kpi
              label="% con error"
              value={`${data.kpis.fallbackPct}%`}
              sub={`${data.kpis.fallback30d} consultas`}
              color={data.kpis.fallbackPct > 5 ? "text-accent-deep" : "text-ink"}
            />
            <Kpi
              label="% piden aclaración"
              value={`${data.kpis.clarifPct}%`}
              sub={`${data.kpis.clarification30d} consultas`}
              color="text-social"
            />
            <Kpi
              label="Top recomendado"
              value={data.topRecommended[0]?.slug.slice(0, 18) || "—"}
              sub={
                data.topRecommended[0]
                  ? `${data.topRecommended[0].count} veces`
                  : undefined
              }
              color="text-accent"
            />
          </section>
        )}

        {/* Top recomendados */}
        {data && data.topRecommended.length > 0 && (
          <section className="mb-6 rounded-2xl border border-line bg-bone p-4">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-ink/50">
              Productos más recomendados (últimos 30 días)
            </p>
            <div className="flex flex-wrap gap-2">
              {data.topRecommended.map((r) => (
                <Link
                  key={r.slug}
                  href={`/catalogo/${r.slug}`}
                  target="_blank"
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-bone-soft px-3 py-1 text-xs hover:border-accent"
                >
                  <span className="font-mono text-ink/70">{r.slug}</span>
                  <span className="font-semibold tabular-nums text-accent">
                    ×{r.count}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar en briefs (ej. 'camisetas evento')…"
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
          <select
            value={days}
            onChange={(e) => {
              setDays(parseInt(e.target.value));
              setPage(1);
            }}
            className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs"
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={180}>180 días</option>
            <option value={365}>1 año</option>
          </select>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">🤖</p>
            <p className="mt-3 font-display text-lg text-ink">Sin consultas todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Cuando alguien use el recomendador IA, aparecerá aquí su brief.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink/60">
              {data.total} consultas en el rango · ordenadas por más recientes
            </p>
            <div className="space-y-2">
              {data.items.map((it) => {
                const isExp = expanded === it.id;
                const time = new Date(it.createdAt);
                return (
                  <article
                    key={it.id}
                    className="rounded-2xl border border-line bg-bone p-4 hover:border-accent/40"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-ink/50">
                        <span className="tabular-nums">
                          {time.toLocaleDateString("es-ES")} {time.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {it.fallback && (
                          <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-deep">
                            Error JSON
                          </span>
                        )}
                        {it.needsClarification && (
                          <span className="rounded-full bg-social/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-social">
                            Aclaración
                          </span>
                        )}
                        {it.ecoOnly && (
                          <span className="rounded-full bg-bone-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink/60">
                            Eco only
                          </span>
                        )}
                        {it.budget && (
                          <span className="text-ink/60">
                            💰 {it.budget.toLocaleString("es-ES")}€
                          </span>
                        )}
                        {it.quantity && (
                          <span className="text-ink/60">×{it.quantity} uds</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExp ? null : it.id)}
                        className="text-[11px] text-ink/50 hover:text-accent"
                      >
                        {isExp ? "Cerrar" : "Detalle ↓"}
                      </button>
                    </div>

                    <p className={`mt-2 text-sm text-ink ${isExp ? "" : "line-clamp-2"}`}>
                      {it.brief}
                    </p>

                    {it.recommendedSlugs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {it.recommendedSlugs.slice(0, isExp ? 99 : 5).map((s) => (
                          <Link
                            key={s}
                            href={`/catalogo/${s}`}
                            target="_blank"
                            className="rounded-full border border-line bg-bone-soft px-2 py-0.5 font-mono text-[10px] text-ink/70 hover:border-accent"
                          >
                            {s}
                          </Link>
                        ))}
                        {!isExp && it.recommendedSlugs.length > 5 && (
                          <span className="text-[10px] text-ink/40">
                            +{it.recommendedSlugs.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {isExp && (
                      <div className="mt-3 grid gap-3 rounded-xl border border-line bg-bone-soft p-3 text-xs sm:grid-cols-2">
                        {it.summary && (
                          <div className="sm:col-span-2">
                            <p className="text-[10px] uppercase tracking-wider text-ink/40">
                              Resumen del modelo
                            </p>
                            <p className="mt-0.5 text-ink/80">{it.summary}</p>
                          </div>
                        )}
                        {it.modelUsed && (
                          <Row label="Modelo" value={it.modelUsed} />
                        )}
                        {(it.promptTokens || it.completionTokens) && (
                          <Row
                            label="Tokens"
                            value={`${it.promptTokens || 0} in / ${it.completionTokens || 0} out`}
                          />
                        )}
                        {it.ip && <Row label="IP" value={it.ip} />}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs">
                <p className="text-ink/60">
                  Página {data.page} de {data.totalPages}
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
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
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

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${color || "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink/40">{label}</p>
      <p className="mt-0.5 break-all text-ink/80">{value}</p>
    </div>
  );
}
