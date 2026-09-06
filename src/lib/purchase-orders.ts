import type { PurchaseOrder, SupplierCode } from "@prisma/client";
import { paymentItemsFingerprint } from "@/lib/payment-quote-fingerprint";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { resolveProductsBySlugs } from "@/lib/product-slug-resolver";

/**
 * Divide un CartQuote en N PurchaseOrder, uno por supplier de los productos.
 *
 * Idempotente: si el cart ya tiene POs creados, no crea nuevos. Asigna los
 * items que aún no tengan purchaseOrderId al PO de su supplier correspondiente.
 * Esa idempotencia es post-hoc (mira si los items ya están asignados), así que
 * no cubría las ejecuciones SOLAPADAS; de ahí el cerrojo por carrito de abajo.
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
export async function createPurchaseOrdersFromCart(cartId: string, expectedItemsFingerprint?: string): Promise<PurchaseOrder[]> {
  // El reparto es idempotente entre llamadas SEGUIDAS (la segunda ve los items
  // ya asignados y los salta), pero no entre llamadas SOLAPADAS: ambas leen los
  // items todavía sin asignar, ninguna encuentra PO previo y las dos crean el
  // suyo. Medido con dos ejecuciones a la vez sobre un carrito de 150 €: dos PO
  // de MidOcean y un total de 300 €.
  //
  // Y el daño no se queda en una fila de más: cada `*-auto-order` busca EL PO
  // de su proveedor y filtra los items por ese id, así que si los items acaban
  // colgando del otro PO el pedido se queda sin items y NO SE CURSA. El cliente
  // paga y no se pide nada, que es peor que duplicar.
  //
  // Puede pasar porque el webhook de Stripe llega por dos ramas del mismo pago
  // y porque el panel tiene un botón «split» que llama aquí igual.
  //
  // Aquí sí se suelta el cerrojo en `finally`, al revés que al pedir a un
  // proveedor: esto no tiene efectos fuera de nuestra base de datos, así que
  // volver a intentarlo es gratis y bloquear reintentos sería lo caro.
  const lockKey = `cart_split:${cartId}`;
  if (!(await acquireCronLock(lockKey, SPLIT_LOCK_TTL_MS))) {
    // Otro proceso está repartiendo este mismo carrito ahora mismo. Se devuelve
    // lo que haya en este instante: quien llama solo lo usa para el log, y los
    // `*-auto-order` releen de la BD cuando les toca.
    return prisma.purchaseOrder.findMany({ where: { cartId } });
  }
  try {
    return await repartirCarritoEnPurchaseOrders(cartId, expectedItemsFingerprint);
  } finally {
    await releaseCronLock(lockKey);
  }
}

/** TTL corto: el reparto no hace llamadas externas, tarda milisegundos. */
const SPLIT_LOCK_TTL_MS = 2 * 60 * 1000;

async function repartirCarritoEnPurchaseOrders(cartId: string, expectedItemsFingerprint?: string): Promise<PurchaseOrder[]> {
  // Cargar items con el supplier del producto subyacente
  const items = await prisma.cartQuoteItem.findMany({
    where: { cartId },
    include: { markings: true },
  });
  if (expectedItemsFingerprint && paymentItemsFingerprint(items) !== expectedItemsFingerprint) {
    throw new Error("La versión del presupuesto cambió antes del reparto");
  }
  if (items.length === 0) return [];

  // Mapeo productSlug → supplier (1 query)
  const slugs = Array.from(new Set(items.map((it) => it.productSlug)));
  const products = await resolveProductsBySlugs(slugs, (candidateSlugs) =>
    prisma.product.findMany({
      where: { slug: { in: [...candidateSlugs] } },
      select: { slug: true, supplier: true },
    }),
  );

  // Agrupar items por supplier (skip los que ya tienen PO asignado)
  const groups = new Map<SupplierCode, { itemIds: string[]; total: number }>();
  for (const it of items) {
    if (it.purchaseOrderId) continue; // ya asignado
    const supplier = products.get(it.productSlug)?.product.supplier;
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
    cifra: 10, // Cifra suele entregar más rápido (almacén en España)
    adivin: 3, // Adivin fabrica y entrega en 24-72h (banderas low-cost)
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
