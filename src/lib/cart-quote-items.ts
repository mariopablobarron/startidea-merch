import { prisma } from "@/lib/prisma";

/**
 * Recalcula `estimatedTotalCents` de un CartQuote como Σ de `totalClientCents`
 * de sus líneas (SIN IVA; el 21% se añade en el cobro). Se llama tras cualquier
 * edición de líneas para que el total del presupuesto quede coherente.
 */
export async function recomputeCartTotal(cartId: string): Promise<number> {
  const items = await prisma.cartQuoteItem.findMany({
    where: { cartId },
    select: { totalClientCents: true },
  });
  const estimatedTotalCents = items.reduce((s, it) => s + (it.totalClientCents ?? 0), 0);
  await prisma.cartQuote.update({
    where: { id: cartId },
    data: { estimatedTotalCents },
  });
  return estimatedTotalCents;
}

/**
 * Estados en los que las líneas NO deben editarse: el pedido ya se cursó al
 * proveedor (split en PurchaseOrders) o está archivado. Editar aquí desincroniza
 * los PO / lo ya cobrado.
 */
export const LOCKED_EDIT_STATUSES = new Set(["ORDERED", "ARCHIVED"]);
