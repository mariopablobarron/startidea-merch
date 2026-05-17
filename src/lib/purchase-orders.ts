import type { PurchaseOrder, SupplierCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Divide un CartQuote en N PurchaseOrder, uno por supplier de los productos.
 *
 * Idempotente: si el cart ya tiene POs creados, no crea nuevos. Asigna los
 * items que aún no tengan purchaseOrderId al PO de su supplier correspondiente.
 *
 * Devuelve la lista de POs del cart (los preexistentes + los creados).
 *
 * Plazo estimado por defecto (heurística, se puede afinar):
 *   - midocean: hoy + 12 días laborables
 *   - makito:   hoy + 15 días laborables
 *   - resto:    hoy + 14 días laborables
 *
 * Cliente ve el plazo más tardío (o desglose por PO en el dashboard).
 */
export async function createPurchaseOrdersFromCart(cartId: string): Promise<PurchaseOrder[]> {
  // Cargar items con el supplier del producto subyacente
  const items = await prisma.cartQuoteItem.findMany({
    where: { cartId },
    select: {
      id: true,
      purchaseOrderId: true,
      productSlug: true,
      totalClientCents: true,
    },
  });
  if (items.length === 0) return [];

  // Mapeo productSlug → supplier (1 query)
  const slugs = Array.from(new Set(items.map((it) => it.productSlug)));
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, supplier: true },
  });
  const supplierBySlug = new Map(products.map((p) => [p.slug, p.supplier]));

  // Agrupar items por supplier (skip los que ya tienen PO asignado)
  const groups = new Map<SupplierCode, { itemIds: string[]; total: number }>();
  for (const it of items) {
    if (it.purchaseOrderId) continue; // ya asignado
    const supplier = supplierBySlug.get(it.productSlug);
    if (!supplier) continue; // producto desconocido (no debería pasar)
    const g = groups.get(supplier) || { itemIds: [], total: 0 };
    g.itemIds.push(it.id);
    g.total += it.totalClientCents || 0;
    groups.set(supplier, g);
  }

  if (groups.size === 0) {
    // Todos los items ya estaban asignados → devolver POs existentes
    return prisma.purchaseOrder.findMany({ where: { cartId } });
  }

  // Crear POs (+ asignar items en transacción por supplier)
  const created: PurchaseOrder[] = [];
  for (const [supplier, g] of groups.entries()) {
    // Reusar PO existente del mismo supplier si lo hay (idempotencia entre reintentos)
    const existing = await prisma.purchaseOrder.findFirst({
      where: { cartId, supplier },
    });
    if (existing) {
      // Asignar items nuevos a ese PO + actualizar total
      await prisma.$transaction([
        prisma.cartQuoteItem.updateMany({
          where: { id: { in: g.itemIds } },
          data: { purchaseOrderId: existing.id },
        }),
        prisma.purchaseOrder.update({
          where: { id: existing.id },
          data: { totalClientCents: existing.totalClientCents + g.total },
        }),
      ]);
      created.push(existing);
      continue;
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        cartId,
        supplier,
        status: "PENDING",
        totalClientCents: g.total,
        estimatedDeliveryDate: estimateDeliveryFor(supplier),
        items: { connect: g.itemIds.map((id) => ({ id })) },
      },
    });
    created.push(po);
  }

  return created;
}

/**
 * Devuelve fecha estimada de entrega para un supplier.
 * Heurística simple — se puede ajustar tras tener pedidos reales.
 */
function estimateDeliveryFor(supplier: SupplierCode): Date {
  const businessDays: Record<SupplierCode, number> = {
    midocean: 12,
    makito: 15,
  };
  const days = businessDays[supplier] ?? 14;
  // Aproximación: días laborables = días naturales × 7/5
  const naturalDays = Math.ceil(days * (7 / 5));
  const d = new Date();
  d.setDate(d.getDate() + naturalDays);
  return d;
}

/**
 * Marca un PO como PLACED tras enviarlo al proveedor.
 */
export async function markPurchaseOrderPlaced(
  poId: string,
  supplierOrderRef: string | null,
): Promise<void> {
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: "PLACED",
      supplierOrderRef,
      placedAt: new Date(),
      errorMessage: null,
    },
  });
}

/**
 * Marca un PO como FAILED si hubo error con el proveedor.
 */
export async function markPurchaseOrderFailed(poId: string, error: string): Promise<void> {
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: "FAILED",
      errorMessage: error.slice(0, 4000),
    },
  });
}
