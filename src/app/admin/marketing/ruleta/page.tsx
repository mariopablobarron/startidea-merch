"use client";

import { useEffect, useState } from "react";

type Kind = "perk" | "percent" | "fixed";
type Prize = {
  id: string;
  label: string;
  short: string;
  kind: Kind;
  weight: number;
  value?: number;
  minTotalCents?: number;
  perkNote?: string;
};
type Stats = {
  spins: number;
  spins7d: number;
  couponsIssued: number;
  couponsRedeemed: number;
  redemptionRate: number;
  byPrize: { id: string; label: string; kind: string; count: number }[];
  bySource: { ruleta: number; classic: number };
};

const KIND_BADGE: Record<Kind, string> = {
  perk: "Perk (coste ~0)",
  percent: "Descuento %",
  fixed: "Importe fijo",
};

export default function RuletaAdminPage() {
  const [prizes, setPrizes] = useState<Prize[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ruleta/config", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => d.prizes && setPrizes(d.prizes))
      .catch(() => setErr("No se pudo cargar la configuración"));
    fetch("/api/admin/ruleta/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => d.stats && setStats(d.stats))
      .catch(() => {});
  }, []);

  function update(i: number, patch: Partial<Prize>) {
    setPrizes((p) => (p ? p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : p));
  }

  async function save() {
    if (!prizes) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/ruleta/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prizes }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Error guardando");
        return;
      }
      setPrizes(d.prizes);
      setMsg("Guardado ✓ — los premios ya están activos");
    } catch {
      setErr("Error de red");
    } finally {
      setSaving(false);
    }
  }

  const totalWeight = prizes ? prizes.reduce((s, p) => s + (p.weight || 0), 0) : 0;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <header className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Captación</p>
        <h1 className="font-display text-3xl font-semibold text-ink">Ruleta de premios 🎡</h1>
        <p className="mt-1 text-sm text-ink/60">
          Edita los premios y pesos del popup, y mira cómo está captando. Los cambios se aplican al
          instante en la web.
        </p>
      </header>

      {/* ── KPIs ─────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
          Resultados
        </h2>
        {!stats ? (
          <p className="text-sm text-ink/50">Cargando KPIs…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Giros (total)" value={stats.spins} />
              <Metric label="Giros (7 días)" value={stats.spins7d} />
              <Metric label="Cupones emitidos" value={stats.couponsIssued} />
              <Metric label="% canje" value={`${stats.redemptionRate}%`} sub={`${stats.couponsRedeemed} usados`} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-line bg-bone p-4">
                <p className="mb-2 text-sm font-medium text-ink">Reparto por premio</p>
                <table className="w-full text-sm">
                  <tbody>
                    {stats.byPrize.map((p) => (
                      <tr key={p.id} className="border-t border-line first:border-0">
                        <td className="py-1.5 text-ink/80">{p.label}</td>
                        <td className="py-1.5 text-right font-medium text-ink">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-line bg-bone p-4">
                <p className="mb-2 text-sm font-medium text-ink">A/B — leads por variante</p>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl bg-accent/10 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-accent-deep">Ruleta</p>
                    <p className="text-2xl font-semibold text-ink">{stats.bySource.ruleta}</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-bone-soft p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-ink/60">Popup clásico</p>
                    <p className="text-2xl font-semibold text-ink">{stats.bySource.classic}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-ink/50">
                  Conversión comparable (con impresiones) en{" "}
                  <a href="/admin/insights/experiments" className="text-accent-deep underline-offset-2 hover:underline">
                    Insights › Experimentos
                  </a>
                  .
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Editor de premios ────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Premios y pesos
          </h2>
          <span className="text-[11px] text-ink/50">Peso total: {totalWeight}</span>
        </div>

        {!prizes ? (
          <p className="text-sm text-ink/50">Cargando premios…</p>
        ) : (
          <div className="grid gap-3">
            {prizes.map((p, i) => {
              const prob = totalWeight > 0 ? Math.round((p.weight / totalWeight) * 100) : 0;
              return (
                <div key={p.id} className="rounded-2xl border border-line bg-bone p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-deep">
                      {KIND_BADGE[p.kind]}
                    </span>
                    <span className="text-[11px] text-ink/50">
                      gajo «{p.short}» · sale ~{prob}%
                    </span>
                  </div>

                  <label className="block text-[11px] text-ink/60">Etiqueta (resultado + email)</label>
                  <input
                    value={p.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className="mb-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />

                  <div className="flex flex-wrap gap-3">
                    <Field label="Peso (frecuencia)">
                      <input
                        type="number"
                        min={0}
                        value={p.weight}
                        onChange={(e) => update(i, { weight: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-24 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </Field>

                    {p.kind === "percent" && (
                      <Field label="Descuento (%)">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={p.value ?? 0}
                          onChange={(e) => update(i, { value: Number(e.target.value) || 0 })}
                          className="w-24 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                        />
                      </Field>
                    )}

                    {p.kind === "fixed" && (
                      <Field label="Importe (€)">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={((p.value ?? 0) / 100).toFixed(2)}
                          onChange={(e) => update(i, { value: Math.round((Number(e.target.value) || 0) * 100) })}
                          className="w-28 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                        />
                      </Field>
                    )}

                    {(p.kind === "percent" || p.kind === "fixed") && (
                      <Field label="Pedido mínimo (€)">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={((p.minTotalCents ?? 0) / 100).toFixed(2)}
                          onChange={(e) =>
                            update(i, { minTotalCents: Math.round((Number(e.target.value) || 0) * 100) })
                          }
                          className="w-28 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                        />
                      </Field>
                    )}
                  </div>

                  {p.kind === "perk" && (
                    <div className="mt-2">
                      <label className="block text-[11px] text-ink/60">Texto del email (cómo se cumple)</label>
                      <textarea
                        value={p.perkNote ?? ""}
                        onChange={(e) => update(i, { perkNote: e.target.value })}
                        rows={2}
                        className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[11px] text-ink/50">
          El dibujo del gajo en la rueda es fijo; aquí editas el premio real (peso, etiqueta, valor,
          mínimo). Para añadir o quitar gajos, pídemelo. Pon peso 0 para desactivar un premio sin
          borrarlo.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !prizes}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar premios"}
          </button>
          {msg && <span className="text-sm text-social">{msg}</span>}
          {err && <span className="text-sm text-accent-deep">⚠ {err}</span>}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-bone p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink/55">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-[11px] text-ink/50">{sub}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-ink/60">{label}</label>
      {children}
    </div>
  );
}
