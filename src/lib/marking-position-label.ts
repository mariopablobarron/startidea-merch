/**
 * Cómo se le nombra al cliente la zona donde va su logo.
 *
 * `displayPositionId` limpia el código crudo del proveedor y SIEMPRE devuelve
 * un string, porque los desplegables necesitan algo que pintar. El problema es
 * que casi la mitad del catálogo usa códigos que no dicen nada de dónde va el
 * logo. Medido en producción el 2026-08-04 sobre 22.931 posiciones:
 *
 *   Area 1  2.436 · DEFAULT 1.991 · Area 2 1.847 · Area 3 1.233 · Area 4 1.007
 *   Area 5    676 · Area 6   538 · Area 7   382 · …   →  10.692 genéricas (47%)
 *   frente a FRONT (884) o BACK (787), que sí informan.
 *
 * Con eso, la ficha le decía al cliente «Se marca en Default»: no le dice dónde
 * se marca y delata que el texto sale de un feed. Y las 1.991 `DEFAULT` **no
 * tienen ni una medida** (0 con `maxWidthMm`+`maxHeightMm`), así que en ese caso
 * no hay nada honesto que enseñar: se calla.
 *
 * Reglas:
 *   - código informativo (FRONT, ROUNDSCREEN, "Cara A"…) → su nombre legible.
 *   - genérico numerado (Area 3)  → «Área 3», conservando el número del
 *     proveedor: renumerar por posición en la lista haría que el cliente diga
 *     «zona 2» y el pedido guarde otra.
 *   - genérico sin número (DEFAULT) → en una lista, «Zona N» por orden (hay que
 *     poder elegirla); suelto, nada.
 *   - en prosa con UNA sola zona, el nombre genérico no aporta: se enseña el
 *     área máxima, que sí informa, y si tampoco la hay no se escribe la frase.
 *
 * No se toca `marking-position-display.ts` a propósito: lo comparten el panel de
 * admin, el agente de voz y los emails de mockup, y allí sigue haciendo falta
 * que devuelva siempre un string.
 */

import { displayPositionId } from "./marking-position-display";

export type PositionLike = {
  positionId: string;
  maxWidthMm?: number | null;
  maxHeightMm?: number | null;
};

export type SinglePositionDescription = {
  /** Nombre que informa de DÓNDE va el logo, o null si el código no lo dice. */
  zone: string | null;
  /** Área máxima ya formateada («100×80 mm»), o null si no hay medidas. */
  size: string | null;
};

/** Códigos que no aportan nada por sí solos, sin número que conservar. */
const GENERIC_EXACT = new Set(["DEFAULT", "DEFAULT AREA", "N/A", "NA", "-", "—"]);

/** «Area 3», «AREA_3», «Zona 2», «Position 1»… → genéricas, con número. */
const GENERIC_NUMBERED = /^(?:AREA|ÁREA|ZONE|ZONA|POSITION|POSICION|POSICIÓN|POS)[\s._-]*(\d+)$/;

function normalize(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** ¿El código de zona deja al cliente sin saber dónde se marca? */
export function isGenericPositionId(code: string | null | undefined): boolean {
  const upper = normalize(code);
  if (!upper) return true;
  return GENERIC_EXACT.has(upper) || GENERIC_NUMBERED.test(upper);
}

/** Número que el proveedor le puso a la zona genérica («Area 3» → 3). */
export function genericZoneNumber(code: string | null | undefined): number | null {
  const match = normalize(code).match(GENERIC_NUMBERED);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

function formatMm(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

/** «100×80 mm», o null si falta alguna medida o no es positiva. */
export function formatPositionSize(position: PositionLike): string | null {
  const { maxWidthMm: w, maxHeightMm: h } = position;
  if (typeof w !== "number" || typeof h !== "number") return null;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return `${formatMm(w)}×${formatMm(h)} mm`;
}

/**
 * Etiqueta para listas (chips, selects, galería): SIEMPRE devuelve algo, porque
 * el cliente tiene que poder distinguir una zona de otra para elegirla.
 */
export function positionOptionLabel(position: PositionLike, index: number): string {
  if (!isGenericPositionId(position.positionId)) {
    return displayPositionId(position.positionId);
  }
  const number = genericZoneNumber(position.positionId);
  if (number !== null) return `Área ${number}`;
  return `Zona ${index + 1}`;
}

/**
 * Para la frase «Se marca en …» cuando el producto tiene UNA sola zona. Aquí sí
 * puede devolver null: si el código es genérico y no hay medidas, lo correcto es
 * no escribir la frase en vez de inventarse un nombre.
 */
export function describeSinglePosition(position: PositionLike): SinglePositionDescription {
  const size = formatPositionSize(position);
  if (isGenericPositionId(position.positionId)) return { zone: null, size };
  return { zone: displayPositionId(position.positionId), size };
}
