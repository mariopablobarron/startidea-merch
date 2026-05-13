"use client";

import { useState } from "react";
import { getMarkingTechniqueInfo } from "@/lib/marking-techniques";

/**
 * Tooltip educativo inline para técnicas de marcaje en B2B merchandising.
 * Se acopla a cualquier select/option con el nombre de la técnica como
 * children y muestra al hover/click un panel con pros, contras, productos
 * ideales y mínimo recomendado.
 *
 * Diseño:
 *   - Icono ⓘ pequeño al lado del label.
 *   - Hover/focus muestra panel absoluto. Click toggle (móvil sin hover).
 *   - Cierra con click fuera o Esc.
 */
export function MarkingTechniqueTooltip({ name }: { name: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const info = getMarkingTechniqueInfo(name);
  if (!info) return null;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Información sobre ${name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-ink/20 text-[10px] font-bold text-ink/50 transition hover:border-accent hover:text-accent"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-line bg-bone p-4 text-left text-xs text-ink shadow-lg"
        >
          <span className="block font-display text-sm font-semibold text-ink">
            {name}
          </span>
          <span className="mt-2 block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-social">
              Ventajas
            </span>
            <ul className="mt-1 space-y-0.5 text-ink/80">
              {info.pros.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-social">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </span>
          <span className="mt-3 block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-accent-deep">
              A tener en cuenta
            </span>
            <ul className="mt-1 space-y-0.5 text-ink/80">
              {info.cons.map((c, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-accent-deep">⚠</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </span>
          <span className="mt-3 block rounded-lg bg-bone-soft p-2 text-[11px]">
            <span className="block text-ink/60">
              <strong className="text-ink">Ideal para:</strong> {info.bestFor}
            </span>
            <span className="mt-1 block text-ink/60">
              <strong className="text-ink">Mínimo recomendado:</strong> {info.minQty} unidades
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
