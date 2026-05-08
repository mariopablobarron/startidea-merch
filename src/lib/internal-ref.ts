import { createHash } from "node:crypto";

/**
 * Genera una referencia propia Startidea determinística a partir del ID del
 * producto. Formato: "STM-XXXXXX" — 6 chars base32 derivados de SHA-1(id).
 *
 * Por qué propia: nunca exponer la ref del proveedor (MidOcean) al cliente
 * para evitar que cruce con el catálogo del proveedor o que un competidor
 * nos copie el sourcing. La supplierRef se conserva en BD para uso interno.
 *
 * Determinístico: el mismo product.id siempre produce la misma ref. Esto
 * permite recalcular sin colisiones y mantener URLs/refs estables si la BD
 * se reinicia desde la fuente.
 */

// Alfabeto base32 sin caracteres ambiguos (no 0/O, no 1/I/L)
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateInternalRef(productId: string): string {
  const hash = createHash("sha1").update(productId).digest();
  let bits = 0n;
  for (let i = 0; i < 4; i++) bits = (bits << 8n) | BigInt(hash[i]);
  let s = "";
  // Bug histórico: ALPHABET tiene 31 chars y el mask 31n permite valor 31
  // (out of bounds) → ALPHABET[31] devuelve undefined y la string se
  // concatenaba como "STM-XYZundefinedABC". El módulo asegura índice válido
  // sin perder distribución sensible (1/32 de los chars caen sobre el primero).
  const len = BigInt(ALPHABET.length);
  for (let i = 0; i < 6; i++) {
    const idx = Number((bits & 31n) % len);
    s = ALPHABET[idx] + s;
    bits >>= 5n;
  }
  return `STM-${s}`;
}

/**
 * Para mostrar al cliente. Si por alguna razón no hay internalRef (producto
 * recién creado y aún sin backfill), genera al vuelo desde el id.
 */
export function publicRef(product: { id: string; internalRef: string | null }): string {
  return product.internalRef || generateInternalRef(product.id);
}
