import type { CartQuoteItem, CartQuoteItemMarking } from "@prisma/client";

export type ItemWithMarkings = CartQuoteItem & { markings?: CartQuoteItemMarking[] };

/**
 * Texto de la columna "Marcaje" de una línea de presupuesto. Un ítem puede
 * llevar VARIAS posiciones de marca (pecho + espalda, o Área 1 + Área 7); el
 * precio de la línea suma todas, así que el resumen debe listarlas todas.
 * Antes solo se pintaba la posición PLANA (la primera) y las adicionales
 * quedaban invisibles pese a estar cotizadas y cobradas — el cliente veía
 * "Area 1" y no su Área 7. Si la línea no tiene `markings[]` (datos antiguos)
 * cae a los campos planos. Una línea por posición (separadas por \n).
 */
export function markingCellText(it: ItemWithMarkings): string {
  const fmt = (technique?: string | null, position?: string | null, colours?: number | null) =>
    technique
      ? `${technique}${position ? ` · ${position}` : ""}${colours && colours > 1 ? ` · ${colours} col.` : ""}`
      : null;

  if (it.markings && it.markings.length > 0) {
    const lines = [...it.markings]
      .sort((a, b) => a.order - b.order)
      .map((m) => fmt(m.techniqueName ?? it.markingTechniqueName, m.positionLabel ?? m.positionId, m.numberOfColors))
      .filter((l): l is string => Boolean(l));
    if (lines.length > 0) return lines.join("\n");
  }

  return fmt(it.markingTechniqueName, it.markingPositionId, it.markingColours) ?? "—";
}
