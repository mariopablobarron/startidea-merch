"use client";

/**
 * /admin/suppliers/cifra/marking-rates
 *
 * CRUD de SupplierMarkingRule para Cifra. Cifra no expone tarifa estructurada
 * de marcaje vía API — aquí cargas manualmente la aproximación por % sobre el
 * precio unitario del producto.
 *
 * UX:
 *   - Tabla con reglas existentes (técnica · etiqueta · +%X · setup · activa)
 *   - Aside: códigos `tgrabacion` reales del catálogo Cifra (con conteo de
 *     productos que los usan) para guiar qué crear.
 *   - Form simple inline para añadir + edit inline en cada fila.
 */

import { Fragment, useCallback, useEffect, useState } from "react";

type Rule = {
  id: string;
  supplier: string;
  techniqueCode: string;
  techniqueLabel: string;
  markupPct: number;
  setupCents: number | null;
  active: boolean;
  notes: string | null;
  tier1MinQty: number | null;
  tier1UnitCents: number | null;
  tier2MinQty: number | null;
  tier2UnitCents: number | null;
  tier3MinQty: number | null;
  tier3UnitCents: number | null;
  tier4MinQty: number | null;
  tier4UnitCents: number | null;
};

const TIER_KEYS = [1, 2, 3, 4] as const;

type Hint = { techniqueCode: string; productCount: number };

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export default function CifraMarkingRatesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [hints, setHints] = useState<Hint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tierDraft, setTierDraft] = useState<Record<string, string>>({});

  // Form state
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [markupPct, setMarkupPct] = useState("15");
  const [setupEur, setSetupEur] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/suppliers/cifra/marking-rules", {
        credentials: "include",
      });
      const d = await r.json();
      setRules(d.rules || []);
      setHints(d.hints || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createRule() {
    setSaving(true);
    setError(null);
    try {
      const setupCents = setupEur.trim()
        ? Math.round(parseFloat(setupEur.replace(",", ".")) * 100)
        : null;
      const r = await fetch("/api/admin/suppliers/cifra/marking-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          techniqueCode: code,
          techniqueLabel: label,
          markupPct: parseInt(markupPct, 10),
          setupCents,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      setCode("");
      setLabel("");
      setMarkupPct("15");
      setSetupEur("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateRule(id: string, patch: Partial<Rule>) {
    await fetch("/api/admin/suppliers/cifra/marking-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, ...patch }),
    });
    await load();
  }

  function openTierEditor(r: Rule) {
    if (expandedId === r.id) {
      setExpandedId(null);
      return;
    }
    const draft: Record<string, string> = {};
    for (const n of TIER_KEYS) {
      const minQty = r[`tier${n}MinQty` as const];
      const cents = r[`tier${n}UnitCents` as const];
      draft[`minQty${n}`] = minQty != null ? String(minQty) : "";
      draft[`price${n}`] = cents != null ? (cents / 100).toString().replace(".", ",") : "";
    }
    setTierDraft(draft);
    setExpandedId(r.id);
  }

  async function saveTiers(id: string) {
    const patch: Record<string, number | null> = {};
    for (const n of TIER_KEYS) {
      const minQtyStr = tierDraft[`minQty${n}`]?.trim();
      const priceStr = tierDraft[`price${n}`]?.trim();
      patch[`tier${n}MinQty`] = minQtyStr ? parseInt(minQtyStr, 10) : null;
      patch[`tier${n}UnitCents`] = priceStr
        ? Math.round(parseFloat(priceStr.replace(",", ".")) * 100)
        : null;
    }
    await updateRule(id, patch as Partial<Rule>);
    setExpandedId(null);
  }

  async function deleteRule(id: string) {
    if (!confirm("¿Borrar esta regla? No se puede deshacer.")) return;
    await fetch(`/api/admin/suppliers/cifra/marking-rules?id=${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  }

  // Códigos hint que aún NO tienen regla creada
  const definedCodes = new Set(rules.map((r) => r.techniqueCode));
  const missingHints = hints.filter((h) => !definedCodes.has(h.techniqueCode));

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Proveedores · Cifra
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Tarifa aproximada de marcaje
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            Cifra no expone el pricelist de marcaje vía API. Aquí defines un{" "}
            <strong>% aproximado por técnica</strong> sobre el precio unitario del producto. La
            cotización real la confirmas tú al recibir la solicitud.
          </p>
        </header>

        {/* Reglas existentes */}
        <section className="mb-8">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
            Reglas activas ({rules.filter((r) => r.active).length} de {rules.length})
          </p>
          {loading ? (
            <p className="text-sm text-ink/55">Cargando…</p>
          ) : rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-bone p-6 text-center">
              <p className="text-sm text-ink/65">
                Aún no hay reglas. Empieza por las técnicas más usadas en el catálogo (aside →).
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-[11px] uppercase tracking-wider text-ink/55">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Etiqueta legible (cliente)</th>
                    <th className="p-3">Tarifa</th>
                    <th className="p-3 text-right">Setup / cliché</th>
                    <th className="p-3 text-center">Activa</th>
                    <th className="p-3 text-right">—</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const hasTiers = r.tier1UnitCents != null;
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-t border-line">
                          <td className="p-3">
                            <code className="rounded-md bg-accent-wash px-2 py-0.5 font-mono text-xs text-accent-deep">
                              {r.techniqueCode}
                            </code>
                          </td>
                          <td className="p-3 text-ink/80">{r.techniqueLabel}</td>
                          <td className="p-3">
                            {hasTiers ? (
                              <button
                                onClick={() => openTierEditor(r)}
                                className="rounded-full bg-social/15 px-2.5 py-1 text-[11px] font-medium text-social hover:opacity-80"
                                title="Tarifa real por tramos — clic para editar"
                              >
                                ✓ Real: {EUR.format((r.tier1UnitCents ?? 0) / 100)}/ud →{" "}
                                {EUR.format((r.tier4UnitCents ?? r.tier1UnitCents ?? 0) / 100)}/ud
                              </button>
                            ) : (
                              <button
                                onClick={() => openTierEditor(r)}
                                className="rounded-full bg-accent-wash px-2.5 py-1 text-[11px] font-medium text-accent-deep hover:opacity-80"
                                title="Sin tarifa real — usando % aproximado. Clic para cargar tramos reales."
                              >
                                ⚠ Aprox. +{r.markupPct}% — cargar tramos reales
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-ink/65">
                            {r.setupCents ? EUR.format(r.setupCents / 100) : "—"}
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={r.active}
                              onChange={(e) => updateRule(r.id, { active: e.target.checked })}
                              className="h-4 w-4 cursor-pointer accent-accent"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => deleteRule(r.id)}
                              className="text-[11px] text-ink/50 hover:text-accent"
                            >
                              Borrar
                            </button>
                          </td>
                        </tr>
                        {expandedId === r.id && (
                          <tr className="border-t border-line bg-bone-soft/60">
                            <td colSpan={6} className="p-4">
                              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
                                Tramos por cantidad — precio ABSOLUTO por unidad (€/ud), no % del
                                producto. Deja un tramo en blanco para borrarlo.
                              </p>
                              <div className="grid grid-cols-4 gap-3">
                                {TIER_KEYS.map((n) => (
                                  <div key={n}>
                                    <label className="mb-1 block text-[10px] text-ink/55">
                                      Desde (uds)
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={tierDraft[`minQty${n}`] ?? ""}
                                      onChange={(e) =>
                                        setTierDraft((d) => ({ ...d, [`minQty${n}`]: e.target.value }))
                                      }
                                      placeholder={n === 1 ? "1" : "—"}
                                      className="w-full rounded-lg border border-line bg-bone px-2 py-1.5 text-right font-mono text-xs outline-none focus:border-accent"
                                    />
                                    <label className="mb-1 mt-2 block text-[10px] text-ink/55">
                                      €/ud
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={tierDraft[`price${n}`] ?? ""}
                                      onChange={(e) =>
                                        setTierDraft((d) => ({ ...d, [`price${n}`]: e.target.value }))
                                      }
                                      placeholder="0,00"
                                      className="w-full rounded-lg border border-line bg-bone px-2 py-1.5 text-right font-mono text-xs outline-none focus:border-accent"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => saveTiers(r.id)}
                                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bone hover:bg-accent-dark"
                                >
                                  Guardar tramos
                                </button>
                                <button
                                  onClick={() => setExpandedId(null)}
                                  className="rounded-full border border-line px-4 py-1.5 text-xs hover:border-accent"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Form + hints */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          {/* Form añadir */}
          <section className="rounded-2xl border border-line bg-bone p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">
              Nueva regla
            </p>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-[120px,1fr] gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                    Código
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="A"
                    maxLength={10}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                    Etiqueta visible al cliente
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Tampografía"
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                    Markup %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                    Setup (€ opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={setupEur}
                    onChange={(e) => setSetupEur(e.target.value)}
                    placeholder="30"
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>
              {error && (
                <p className="rounded-xl bg-accent-wash p-2 text-xs text-accent-deep">⚠ {error}</p>
              )}
              <button
                onClick={createRule}
                disabled={saving || !code.trim() || !label.trim()}
                className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Crear regla"}
              </button>
            </div>
          </section>

          {/* Hints (códigos del catálogo aún sin regla) */}
          <section className="rounded-2xl border border-line bg-bone p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">
              Códigos detectados en el catálogo
            </p>
            <p className="mt-2 text-[11px] text-ink/55">
              Códigos <code className="font-mono">tgrabacion</code> que vienen de Cifra. Los que
              ves sin regla son los que conviene dar de alta primero.
            </p>
            {hints.length === 0 ? (
              <p className="mt-3 text-xs text-ink/55">
                Aún no se han sincronizado hints. Dispara el cron <code>cifra-sync</code>.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {hints.slice(0, 15).map((h) => {
                  const hasRule = definedCodes.has(h.techniqueCode);
                  return (
                    <li
                      key={h.techniqueCode}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <code className="rounded-md bg-bone-soft px-2 py-0.5 font-mono text-[11px]">
                          {h.techniqueCode}
                        </code>
                        <span className="text-ink/55">{h.productCount} productos</span>
                      </div>
                      {hasRule ? (
                        <span className="text-[10px] text-social">✓ definida</span>
                      ) : (
                        <button
                          onClick={() => {
                            setCode(h.techniqueCode);
                            setLabel("");
                            setMarkupPct("15");
                          }}
                          className="text-[10px] text-accent hover:underline"
                        >
                          Crear →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {missingHints.length > 15 && (
              <p className="mt-3 text-[11px] text-ink/45">
                + {missingHints.length - 15} códigos más sin regla
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
