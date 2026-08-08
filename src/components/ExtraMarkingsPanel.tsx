"use client";

import { positionOptionLabel } from "@/lib/marking-position-label";
import { MarkingTechniqueTooltip } from "./MarkingTechniqueTooltip";

export type ExtraMarking = {
  positionIdx: number; // índice en positionsAvailable
  techIdx: number;     // índice en position.techniques
  colours: number;
};

type Position = {
  id: string;
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  techniques: {
    techniqueId: string;
    techniqueCode: string;
    techniqueName: string;
    maxColors: number | null;
  }[];
};

/**
 * Panel "Marcas adicionales" para textil con bordado pecho + serigrafía
 * espalda + láser manga (múltiples zonas con técnicas distintas).
 *
 * Coexiste con la primera marca que sigue siendo el bloque principal del
 * ProductOrderForm. Aquí se gestionan SOLO las marcas extra.
 *
 * Cada marca extra puede usar cualquier posición disponible (incluso la
 * misma que la primera marca, por si quieres bordar 2 logos en mismo polo).
 */
export function ExtraMarkingsPanel({
  positionsAvailable,
  extraMarkings,
  onChange,
}: {
  positionsAvailable: Position[];
  extraMarkings: ExtraMarking[];
  onChange: (next: ExtraMarking[]) => void;
}) {
  if (positionsAvailable.length === 0) return null;

  function updateAt(i: number, patch: Partial<ExtraMarking>) {
    const next = extraMarkings.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onChange(next);
  }
  function removeAt(i: number) {
    onChange(extraMarkings.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...extraMarkings,
      { positionIdx: Math.min(1, positionsAvailable.length - 1), techIdx: 0, colours: 1 },
    ]);
  }

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-line bg-bone-soft p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50">
          + Marcas adicionales
          {extraMarkings.length > 0 && (
            <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent-deep">
              {extraMarkings.length}
            </span>
          )}
        </p>
        {extraMarkings.length === 0 && (
          <p className="text-[11px] text-ink/50">
            ej. textil con pecho + manga + espalda
          </p>
        )}
      </div>

      {extraMarkings.length > 0 && (
        <div className="mt-3 space-y-3">
          {extraMarkings.map((m, i) => {
            const pos = positionsAvailable[m.positionIdx];
            const tech = pos?.techniques[m.techIdx];
            const maxColors = tech?.maxColors ?? 1;
            return (
              <div key={i} className="rounded-xl border border-line bg-bone p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-ink">
                    Marca {i + 2} {/* La 1 es la principal */}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="text-[10px] text-ink/50 hover:text-accent"
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-ink/50">Zona</span>
                    <select
                      value={m.positionIdx}
                      onChange={(e) =>
                        updateAt(i, { positionIdx: parseInt(e.target.value, 10), techIdx: 0 })
                      }
                      className="mt-0.5 min-h-[44px] w-full rounded-lg border border-line bg-bone-soft px-2 text-xs outline-none focus:border-accent"
                    >
                      {positionsAvailable.map((p, idx) => (
                        <option key={p.id} value={idx}>
                          {positionOptionLabel(p, idx)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-ink/50">
                      Técnica
                      {tech && <MarkingTechniqueTooltip name={tech.techniqueName} />}
                    </span>
                    <select
                      value={m.techIdx}
                      onChange={(e) =>
                        updateAt(i, { techIdx: parseInt(e.target.value, 10) })
                      }
                      className="mt-0.5 min-h-[44px] w-full rounded-lg border border-line bg-bone-soft px-2 text-xs outline-none focus:border-accent"
                    >
                      {pos?.techniques.map((t, idx) => (
                        <option key={t.techniqueId} value={idx}>
                          {t.techniqueName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-ink/50">Colores</span>
                    <input
                      type="number"
                      min={1}
                      max={maxColors}
                      value={m.colours}
                      onChange={(e) =>
                        updateAt(i, { colours: Math.max(1, Math.min(maxColors, parseInt(e.target.value, 10) || 1)) })
                      }
                      className="mt-0.5 min-h-[44px] w-full rounded-lg border border-line bg-bone-soft px-2 text-xs outline-none focus:border-accent"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1 rounded-full border border-accent bg-bone-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5"
      >
        + Añadir marca {extraMarkings.length === 0 ? "extra" : `${extraMarkings.length + 2}`}
      </button>
    </div>
  );
}
