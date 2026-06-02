"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VariantStats, ExperimentStats } from "@/lib/experiments";

type ExperimentRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  variants: unknown;
  stats: ExperimentStats | null;
};

const EXAMPLE = `{
  "slug": "rec.proposal_card_title",
  "name": "Título del card propuesta email",
  "description": "Qué copy convierte mejor para el card de email",
  "variants": [
    { "key": "A", "weight": 50, "config": { "title": "Quédate la propuesta firmada" } },
    { "key": "B", "weight": 50, "config": { "title": "Recibe tu propuesta en PDF en 30 segundos" } }
  ],
  "active": true
}`;

export function ExperimentsClient({ initial }: { initial: ExperimentRow[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [json, setJson] = useState(EXAMPLE);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("JSON inválido");
      return;
    }
    const res = await fetch("/api/admin/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message || "Error al guardar");
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  async function toggle(id: string, active: boolean) {
    setList((l) => l.map((it) => (it.id === id ? { ...it, active } : it)));
    await fetch("/api/admin/experiments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar experiment? Se borran también todos sus eventos.")) return;
    setList((l) => l.filter((it) => it.id !== id));
    await fetch(`/api/admin/experiments?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Activos ({list.filter((e) => e.active).length})
        </h2>
        <ul className="mt-4 space-y-4">
          {list.length === 0 ? (
            <p className="rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/55">
              Aún no hay experiments. Crea uno abajo.
            </p>
          ) : (
            list.map((e) => <ExperimentRowView key={e.id} exp={e} onToggle={toggle} onRemove={remove} />)
          )}
        </ul>
      </div>

      <div className="rounded-3xl border border-line bg-bone p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Crear o actualizar experiment
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Pega un JSON con slug + name + variants. Los pesos deben sumar 100.
          Si el slug ya existe, se actualiza.
        </p>
        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setSaved(false);
            setError(null);
          }}
          rows={14}
          className="mt-4 w-full rounded-2xl border border-line bg-bone-soft p-4 font-mono text-xs focus:border-accent focus:outline-none"
        />
        {error && <p className="mt-2 text-xs text-accent-deep">{error}</p>}
        {saved && <p className="mt-2 text-xs text-emerald-700">✓ Guardado</p>}
        <button
          onClick={save}
          disabled={busy}
          className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bone transition hover:bg-accent disabled:opacity-50"
        >
          Guardar experiment
        </button>
      </div>
    </div>
  );
}

function ExperimentRowView({
  exp,
  onToggle,
  onRemove,
}: {
  exp: ExperimentRow;
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const stats = exp.stats;
  const sig = stats?.significance ?? 0;
  return (
    <li
      className={`rounded-3xl border p-5 ${
        exp.active ? "border-emerald-300 bg-emerald-50/40" : "border-line bg-bone"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink">{exp.name}</h3>
            {exp.active && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ACTIVO
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-[11px] text-ink/60">{exp.slug}</p>
          {exp.description && <p className="mt-1 text-sm text-ink/70">{exp.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onToggle(exp.id, !exp.active)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              exp.active
                ? "bg-bone-soft text-ink/60 hover:bg-bone"
                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            }`}
          >
            {exp.active ? "Desactivar" : "Activar"}
          </button>
          <button
            onClick={() => onRemove(exp.id)}
            className="rounded-full px-3 py-1 text-xs text-ink/40 hover:bg-accent-wash hover:text-accent-deep"
          >
            Eliminar
          </button>
        </div>
      </div>

      {stats && stats.totalEvents > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-2xl border border-line bg-bone-soft">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-bone text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-ink/70">Variante</th>
                  <th className="px-3 py-2 text-right font-medium text-ink/70">Views</th>
                  <th className="px-3 py-2 text-right font-medium text-ink/70">Cart</th>
                  <th className="px-3 py-2 text-right font-medium text-ink/70">Conv</th>
                  <th className="px-3 py-2 text-right font-medium text-ink/70">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {stats.variants.map((v: VariantStats) => (
                  <tr
                    key={v.variantKey}
                    className={`border-t border-line/40 ${
                      stats.winner === v.variantKey ? "bg-emerald-50 font-semibold" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono">
                      {v.variantKey}
                      {stats.winner === v.variantKey && (
                        <span className="ml-2 text-[10px] text-emerald-700">🏆</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.views}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.cartAdds}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.conversions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.convPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink/55">
            Significance: <strong>{(sig * 100).toFixed(0)}%</strong>
            {stats.winner
              ? ` · ✅ Hay ganador (variante ${stats.winner})`
              : sig > 0
                ? " · Resultado no concluyente todavía"
                : " · Necesita ≥30 views por variante"}
          </p>
        </div>
      )}
    </li>
  );
}
