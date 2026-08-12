/**
 * Portes por defecto del proveedor en el cotizador (Fase B del módulo Proveedores).
 *
 * Vive en `lib/` y no dentro de la página porque decide sobre DINERO: los portes
 * son un COSTE que entra en `costeTotal` y sale multiplicado por el margen en el
 * PVP (`cotizar-core.ts`). Un porte precargado de menos cotiza de menos, y esa
 * cotización acaba en un presupuesto, en un PDF y en un cobro.
 *
 * La regla que sostiene todo esto es «no pisar lo que el admin ha tecleado a
 * mano». En la página esa condición se leía desde una variable de estado dentro
 * de una función `async`, que en React es una FOTO del render en que se creó: si
 * el admin escribía en el campo mientras la petición estaba en vuelo, al
 * resolver seguía viendo `portesTouched === false` y pisaba el valor recién
 * tecleado. Por eso la decisión se toma aquí, con los valores pasados
 * explícitamente, y la página los lee de refs (valor actual, no foto).
 */

export type SupplierShippingDefault = { cents: number; name: string };
export type SupplierShippingMap = Record<string, SupplierShippingDefault>;

/** Mismo techo que acepta la API de cotizar (`portesCents`) y que valida el perfil del proveedor. */
export const MAX_PORTES_CENTS = 1_000_000;

/**
 * ¿Es este un importe de portes que se puede usar sin mirar?
 *
 * Cerrojo, no cosmética: 0 es legítimo (proveedor franco de portes), pero un
 * negativo, un NaN, un Infinity o un decimal harían bajar el coste —y con él el
 * PVP— sin que nadie lo note. Ante un valor imposible se prefiere NO precargar
 * y dejar el que el admin tenga delante: nunca cotizar de menos en silencio.
 */
export function esPortesUsable(cents: unknown): cents is number {
  return (
    typeof cents === "number" &&
    Number.isInteger(cents) &&
    cents >= 0 &&
    cents <= MAX_PORTES_CENTS
  );
}

/**
 * Construye el mapa `código de proveedor → portes por defecto` desde la
 * respuesta de `/api/admin/suppliers`. Las filas sin valor configurado (hoy las
 * cuatro) y las que traigan un importe imposible se quedan fuera: mejor que la
 * precarga no dispare a que dispare con basura.
 */
export function buildSupplierShippingMap(items: unknown): SupplierShippingMap {
  if (!Array.isArray(items)) return {};
  const map: SupplierShippingMap = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { code, name, defaultShippingCents } = item as Record<string, unknown>;
    if (typeof code !== "string" || !code) continue;
    if (defaultShippingCents == null) continue;
    if (!esPortesUsable(defaultShippingCents)) continue;
    map[code] = {
      cents: defaultShippingCents,
      name: typeof name === "string" && name ? name : code,
    };
  }
  return map;
}

export type DecisionPortes =
  | { preload: false; motivo: string }
  | { preload: true; cents: number; name: string };

/**
 * Decide si hay que precargar los portes del proveedor y recotizar una vez.
 *
 * `cents === currentPortesCents` corta la recursión: la página se vuelve a
 * llamar a sí misma con el valor precargado y la API devuelve ese mismo importe
 * como eco (`cotizar-core.ts`), así que la segunda vuelta sale por aquí.
 */
export function decidePortesPreload(args: {
  /** Presente cuando el admin reselecciona técnica: no es una búsqueda nueva. */
  techniqueCode?: string;
  /** ¿Ha tecleado el admin el campo de portes a mano? Valor ACTUAL, no del render. */
  portesTouched: boolean;
  supplierCode: string | null | undefined;
  /** Portes con los que ha respondido la API para esta cotización. */
  currentPortesCents: number;
  map: SupplierShippingMap;
}): DecisionPortes {
  const { techniqueCode, portesTouched, supplierCode, currentPortesCents, map } = args;
  if (techniqueCode) return { preload: false, motivo: "reselección de técnica" };
  if (portesTouched) return { preload: false, motivo: "portes tecleados a mano" };
  if (!supplierCode) return { preload: false, motivo: "sin proveedor en la respuesta" };
  const dflt = map[supplierCode];
  if (!dflt) return { preload: false, motivo: "proveedor sin portes por defecto" };
  if (!esPortesUsable(dflt.cents)) return { preload: false, motivo: "importe no usable" };
  if (dflt.cents === currentPortesCents) return { preload: false, motivo: "ya cotizado con ese valor" };
  return { preload: true, cents: dflt.cents, name: dflt.name };
}

/** Céntimos → texto del input (coma decimal, como el resto del cotizador). */
export function portesCentsAInput(cents: number): string {
  return (cents / 100).toString().replace(".", ",");
}
