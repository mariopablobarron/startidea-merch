/**
 * IVA español (21%). Fuente ÚNICA para todo el sistema.
 *
 * Modelo (decisión de Mario 2026-06-17): los precios del catálogo/cotizador son
 * BASE IMPONIBLE (sin IVA). Siempre se muestra "+ IVA" y, al cobrar/facturar, se
 * añade el 21%. El cobro Stripe y los documentos usan estos helpers para no
 * descuadrar (antes el cobro no añadía IVA → se recaudaba un 21% de menos).
 */
export const IVA_RATE = 0.21;

/** Importe base (céntimos) + IVA, redondeado a céntimos. */
export function withIva(baseCents: number): number {
  return Math.round(baseCents * (1 + IVA_RATE));
}

/** Solo la parte de IVA de un importe base (céntimos). */
export function ivaPart(baseCents: number): number {
  return Math.round(baseCents * IVA_RATE);
}
