/**
 * Cantidades, referencias y unidades de los feeds de proveedor.
 *
 * ── El incidente ────────────────────────────────────────────────────────────
 * El catálogo entero servía el stock dividido por mil y las áreas de marcaje
 * divididas por diez:
 *
 *   · vaso ref. 2555 → la ficha decía «90 uds»; el proveedor tiene +90.000
 *   · vaso ref. 2754 → la ficha decía «160 uds»; el proveedor tiene +160.000
 *   · área de marcaje de esos mismos vasos → «15 × 7 mm» y «17 × 7 mm»,
 *     cuando son 150 × 70 mm y 170 × 70 mm
 *
 * No eran dos fichas mal importadas: eran dos conversiones mal hechas que
 * afectaban a todo lo que pasara por ellas.
 *
 * ── Causa 1 · el XML se parseaba con `parseTagValue: true` ──────────────────
 * fast-xml-parser convierte a número lo que le parece número, y `<stock>90.000
 * </stock>` le parece «noventa coma cero»:
 *
 *   parseTagValue: true  → { stock: 90 }        ← el feed decía 90.000
 *   parseTagValue: false → { stock: "90.000" }  ← intacto, ya se parsea aquí
 *
 * Por eso el sync lee los XML en crudo y las cantidades pasan por
 * `parseFeedCount`, que sabe que en el feed el punto separa millares.
 *
 * ── Causa 2 · los milímetros del área eran centímetros ──────────────────────
 * El API de marcaje da las áreas en CENTÍMETROS y se escribían tal cual en
 * `MarkingPosition.maxWidthMm` / `maxHeightMm`, que están en milímetros.
 *
 * ── La red ──────────────────────────────────────────────────────────────────
 * `esStockImplausible` y `esAreaMarcajeImplausible` marcan los valores que no
 * pueden ser ciertos (un área de menos de 5 mm no se imprime; un producto que
 * el proveedor da como disponible no tiene 3 unidades). No arreglan nada: son
 * el detector de que una conversión ha vuelto a romperse.
 */

/** Un área de marcaje por debajo de esto no es imprimible: es un error de escala. */
export const AREA_MARCAJE_MINIMA_MM = 5;

/** Un producto disponible en el proveedor con menos de esto es un ÷1.000. */
export const STOCK_MINIMO_PLAUSIBLE = 10;

/**
 * Cantidad entera de un feed (stock, tramo de cantidad, unidades por caja).
 *
 * El feed es europeo: **el punto separa millares**. Y como una cantidad es
 * siempre entera, aquí no hay ambigüedad que respetar — al revés que en
 * `toNum`, por donde pasan medidas y pesos donde "1.5" sí es uno y medio.
 *
 *   "90.000"   → 90000     (el bug: parseFloat/parseInt devolvían 90)
 *   "+100.000" → 100000    (Makito prefija el stock alto con "+")
 *   "1.234,56" → 1234      (una cantidad no tiene decimales: se trunca)
 *   "160000"   → 160000
 *   ""/basura  → null      (ausencia: NUNCA 0, que se confunde con "agotado")
 */
export function parseFeedCount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.trunc(v) : null;
  }
  const s = String(v).trim();
  if (!s) return null;

  // Se corta por la coma decimal: de "1.234,56" solo interesa la parte entera.
  const entero = s.split(",")[0];
  // Quitamos el signo "+" del feed, los puntos de millar y los espacios finos.
  const limpio = entero.replace(/^\+/, "").replace(/[.\s ]/g, "");
  if (!/^-?\d+$/.test(limpio)) return null;

  const n = parseInt(limpio, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Referencia/SKU tal como lo guarda la base de datos.
 *
 * Cuidado: esto NO es cosmética. Hasta ahora el XML se parseaba con
 * `parseTagValue: true`, así que una `ref` de "0034" llegaba como número 34 y
 * en BD se guardó "34" (de ahí el `padStart(4, "0")` del enriquecido de
 * marcaje). Al leer el XML en crudo, esa misma ref llega "0034": sin
 * normalizar, el sync crearía un producto duplicado y el stock no cruzaría con
 * ninguna variante.
 *
 * Se normaliza igual que lo hacía la coerción a número: se quitan los ceros a
 * la izquierda **solo** si la referencia es toda dígitos.
 */
export function normalizeFeedRef(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s)) return s;
  const sinCeros = s.replace(/^0+/, "");
  return sinCeros === "" ? "0" : sinCeros;
}

/**
 * Centímetros del proveedor → milímetros de la base de datos.
 *
 * Sin heurística de "si es grande ya vendrá en mm": el API de marcaje da
 * centímetros siempre, y una heurística por umbral es justo lo que convierte
 * un fallo visible en uno silencioso a partir de cierto tamaño.
 */
export function markingCmToMm(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10);
}

/** Lee el flag de disponibilidad del feed. `null` = el feed no dice nada. */
export function parseFeedFlag(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["s", "si", "sí", "y", "yes", "1", "true", "disponible"].includes(s)) return true;
  if (["n", "no", "0", "false", "agotado"].includes(s)) return false;
  return null;
}

/**
 * ¿Este stock es imposible?
 *
 * Cero es perfectamente posible (agotado). Lo que no puede ser es que el
 * proveedor dé el producto como disponible y queden tres unidades: eso es el
 * "90.000 → 90" otra vez.
 */
export function esStockImplausible(args: {
  qty: number | null;
  disponible: boolean | null;
}): boolean {
  const { qty, disponible } = args;
  if (qty === null) return false;
  if (disponible === false) return false;
  return qty > 0 && qty < STOCK_MINIMO_PLAUSIBLE;
}

/** ¿Este lado del área de marcaje es imposible? (null = el feed no lo da). */
export function esAreaMarcajeImplausible(mm: number | null | undefined): boolean {
  if (mm === null || mm === undefined) return false;
  return mm > 0 && mm < AREA_MARCAJE_MINIMA_MM;
}
