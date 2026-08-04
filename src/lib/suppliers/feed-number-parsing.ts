/**
 * Parseo de números de los feeds de proveedor (formato europeo).
 *
 * Vivían privados dentro de `midocean-pricelist-sync.ts`, que importa Prisma:
 * eran puros y críticos para el dinero, y aun así imposibles de testear sin
 * arrastrar media aplicación. Aquí no dependen de nada, así que se pueden fijar
 * con tests directos.
 *
 * El formato del feed es europeo: **el punto separa millares y la coma decimal**
 * ("1.000,50" = mil euros con cincuenta). Leerlo con `parseFloat` a secas
 * divide el número por mil sin avisar.
 *
 * ⚠️ Estas funciones NO cambian de comportamiento respecto a lo que corría
 * antes: son las mismas, movidas de sitio.
 */

/** "0,52" → 52 · "1.000,50" → 100050. Nulo/basura → 0 (nunca NaN). */
export function eurStringToCents(s: string | undefined | null): number {
  if (s == null) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Cantidad mínima de un tramo. Ausente o ilegible → 1 (nunca 0: dividir por 0). */
export function intFromQty(s: string | undefined): number {
  if (!s) return 1;
  const cleaned = s.replace(/[.,]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Área en cm² del feed — MISMO formato europeo que los precios.
 *
 * El sentinel del rango superior llega como "999.999" (= 999999, el infinito
 * del feed); `parseFloat` lo leía como ~1.000 cm² → cualquier espalda de
 * sudadera (1.120 cm²) quedaba FUERA de todos los rangos y el marcaje cotizaba
 * 0 € (auditoría 2026-07-09). De ahí que se limpien los puntos igual que en los
 * precios.
 */
export function parseAreaCm2(s: string | undefined | null): number | null {
  if (s == null || s === "") return null;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
