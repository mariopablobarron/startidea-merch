/**
 * Firma normalizada de mensajes de error para agrupar ocurrencias del
 * mismo bug aunque varíen detalles concretos (IDs, addresses, comillas).
 *
 * Usado por:
 *   - /admin/insights/errors/[id] — agrupar "otras ocurrencias"
 *   - /api/cron/auto-resolve-errors — detectar si un bug sigue vivo
 *
 * Reglas:
 *   - Dígitos consecutivos → "N"  (1234 → N)
 *   - Hex addresses (0xABCD) → "0xH"
 *   - Comillas eliminadas
 *   - Truncado a 120 chars
 */
export function messageSignature(msg: string): string {
  return msg
    // ORDEN IMPORTANTE: hex primero. Si normalizamos dígitos antes, el "0"
    // del prefijo 0x se convierte en "N" y rompe el regex hex después.
    // Placeholder sin dígitos (<hex>) para que la siguiente pasada de \d+
    // no toque el resultado.
    .replace(/0x[a-f0-9]+/gi, "<hex>")
    .replace(/\d+/g, "N")
    .replace(/["'`]/g, "")
    .slice(0, 120);
}
