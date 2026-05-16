"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Stats = { total: number; missingShort: number; missingLong: number; missing: number };
type Preview = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  material: string | null;
  shortLen: number;
  longLen: number;
};
type Result = {
  slug: string;
  ok: boolean;
  error?: string;
  shortLen?: number;
  longLen?: number;
  dryRun?: boolean;
};

export default function AutoDescribePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(10);
  const [dryRun, setDryRun] = useState(true);
  const [totalProcessed, setTotalProcessed] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/products/auto-describe", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
        setPreview(data.preview);
      } else {
        setError(data.error || "Error cargando stats");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runBatch(continuous = false) {
    setRunning(true);
    setError(null);
    if (!continuous) setResults([]);
    try {
      while (true) {
        const res = await fetch("/api/admin/products/auto-describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limit: batchSize, dryRun }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error ejecutando batch");
          break;
        }
        setResults((prev) => [...prev, ...(data.results || [])]);
        setTotalProcessed((c) => c + (data.processed || 0));
        await load();
        if (!continuous || data.processed === 0 || data.remaining === 0) {
          break;
        }
        // mini-pausa entre batches para no agotar tokens
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft">
      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Catálogo · IA</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Auto-generación de descripciones
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-ink/60">
              Genera descripciones SEO con IA (Claude Haiku via OpenRouter) para productos que tienen
              shortDescription o longDescription vacías o pobres. Coste estimado ~$0.002-0.01/producto.
            </p>
          </div>
          <Link href="/admin/products" className="text-xs text-ink/60 hover:text-accent">
            ← Productos
          </Link>
        </header>

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}

        {stats && (
          <section className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total activos" value={stats.total.toLocaleString("es-ES")} />
            <Stat label="Sin desc. corta" value={stats.missingShort.toLocaleString("es-ES")} color="warning" />
            <Stat label="Sin desc. larga" value={stats.missingLong.toLocaleString("es-ES")} color="warning" />
            <Stat
              label="Por procesar"
              value={stats.missing.toLocaleString("es-ES")}
              color={stats.missing === 0 ? "success" : "accent"}
            />
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-line bg-bone p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Ejecutar batch</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-wider text-ink/60">Tamaño batch</span>
              <input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 10)))}
                min={1}
                max={30}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-sm">
                Dry-run (no escribe en BD)
              </span>
            </label>
            <div className="self-end text-xs text-ink/50">
              {totalProcessed > 0 && `Total procesados sesión: ${totalProcessed}`}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running || (stats?.missing ?? 0) === 0}
              onClick={() => runBatch(false)}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone shadow-sm transition hover:bg-accent-dark disabled:opacity-40"
            >
              {running ? "Procesando…" : `Generar ${batchSize} productos`}
            </button>
            <button
              type="button"
              disabled={running || (stats?.missing ?? 0) === 0}
              onClick={() => runBatch(true)}
              className="rounded-full border border-line bg-bone-soft px-5 py-2 text-sm font-medium hover:border-accent disabled:opacity-40"
              title="Procesa todos los productos pendientes en sucesivos batches"
            >
              {running ? "…" : "🔁 Procesar TODOS pendientes"}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={running}
              className="rounded-full border border-line bg-bone-soft px-3 py-2 text-xs hover:border-accent"
            >
              🔄 Refrescar
            </button>
          </div>

          {dryRun && (
            <p className="mt-3 text-[11px] text-accent-deep">
              ⚠ Dry-run activado: la IA generará texto pero NO se escribirá en BD. Desactiva para
              guardar definitivamente.
            </p>
          )}
        </section>

        {preview.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">Próximos en cola</h2>
            <ul className="space-y-1.5">
              {preview.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-bone p-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{p.name}</p>
                    <p className="truncate text-[10px] text-ink/50">
                      {p.category && `${p.category} · `}
                      {p.material && `${p.material} · `}
                      short {p.shortLen}c · long {p.longLen}c
                    </p>
                  </div>
                  <a href={`/catalogo/${p.slug}`} target="_blank" rel="noopener" className="text-[10px] text-accent hover:underline">
                    Ver ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Resultados ({results.filter((r) => r.ok).length} ok · {results.filter((r) => !r.ok).length} fallos)
            </h2>
            <ul className="max-h-96 space-y-1 overflow-y-auto rounded-2xl border border-line bg-bone p-3">
              {results.map((r, i) => (
                <li
                  key={i}
                  className={`flex items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-[11px] ${
                    r.ok ? "bg-social/10" : "bg-accent-wash"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-mono">{r.slug}</span>
                  {r.ok ? (
                    <span className="text-social">
                      ✓ short {r.shortLen}c · long {r.longLen}c{r.dryRun && " · DRY"}
                    </span>
                  ) : (
                    <span className="text-accent-deep">⚠ {r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "warning" | "accent" | "success";
}) {
  const colorClass =
    color === "warning"
      ? "bg-accent-wash text-accent-deep"
      : color === "accent"
        ? "bg-accent text-bone"
        : color === "success"
          ? "bg-social/15 text-social"
          : "bg-bone";
  return (
    <div className={`rounded-2xl border border-line p-4 ${colorClass}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
