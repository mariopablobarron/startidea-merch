/**
 * Override manual de una línea de propuesta desde /admin/cotizar — el
 * comercial puede editar el concepto (nombre visible al cliente) y el precio
 * de línea antes de enviar, para excepciones que la matemática automática no
 * cubre (descuento puntual, redondeo comercial, texto especial).
 *
 * Función pura, sin Prisma — valida el CONJUNTO (no cada campo suelto vía
 * Zod), siguiendo el patrón de los guards de dinero de este repo: un total a
 * 0€/negativo/NaN aquí facturaría gratis o rompería el PDF en silencio.
 */

import { findSupplierLeak } from "./supplier-leak-terms";

export type ProposalItemOverrideInput = {
  description: string;
  totalCents: number;
};

// Tope de cordura, no un límite de negocio real — atrapa un tecleo con un
// cero de más (ej. 500000€ en vez de 5000€) sin bloquear pedidos grandes
// legítimos.
const MAX_TOTAL_CENTS = 10_000_000; // 100.000 €

export function validateProposalOverride(o: ProposalItemOverrideInput): string | null {
  const desc = o.description.trim();
  if (!desc) return "El concepto no puede estar vacío.";
  if (desc.length > 200) return "El concepto es demasiado largo (máx. 200 caracteres).";
  // El concepto es el ÚNICO texto libre del admin que se imprime tal cual en
  // el PDF del cliente (ver proposalLineLabel). Un nombre de proveedor aquí
  // rompe la regla dura del negocio, así que se corta al guardar y no al
  // renderizar: fallar pronto y con el comercial delante.
  const leak = findSupplierLeak(desc);
  if (leak) {
    return `El concepto no puede mencionar al proveedor («${leak}») — el cliente ve este texto en el PDF.`;
  }
  if (!Number.isFinite(o.totalCents)) return "El precio de la línea no es un número válido.";
  if (!Number.isInteger(o.totalCents)) return "El precio de la línea debe ser un importe exacto en céntimos.";
  if (o.totalCents <= 0) return "El precio de la línea tiene que ser mayor que 0 €.";
  if (o.totalCents > MAX_TOTAL_CENTS) {
    return `El precio de la línea supera el máximo permitido (${(MAX_TOTAL_CENTS / 100).toLocaleString("es-ES")} €) — revisa si es un error de tecleo.`;
  }
  return null;
}
