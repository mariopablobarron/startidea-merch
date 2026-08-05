/**
 * Versión programática de "place order en MidOcean" para llamarse
 * automáticamente desde el webhook Stripe tras un pago confirmado.
 *
 * Diferencia con /api/admin/cart-quotes/[id]/place-order:
 *   - Sin auth (uso interno)
 *   - Idempotente: si el cart ya tiene midoceanOrderId, no hace nada
 *   - No lanza error si falta dirección — log warning y NO crea pedido
 *     (será revisado por admin manualmente desde panel)
 *   - Respeta MIDOCEAN_AUTO_PLACE_ON_PAYMENT (env). Si "false", no hace
 *     nada (queda a manual). Default "true" en producción cuando hay
 *     MIDOCEAN_LIVE_ORDERS=true.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  midoceanOrders,
  type MidoceanCreateOrderPayload,
  type MidoceanOrderItem,
} from "@/lib/suppliers/midocean-orders";
import { notifyTelegram } from "@/lib/telegram";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export type AutoOrderResult =
  | { ok: true; orderId: string }
  | { ok: true; dryRun: true; reason: string }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

const FLAG_KEY = "MIDOCEAN_AUTO_PLACE_ON_PAYMENT";

function autoEnabled(): boolean {
  // Default true cuando hay live orders activadas. Permite desactivar
  // explícitamente con MIDOCEAN_AUTO_PLACE_ON_PAYMENT=false.
  const flag = process.env[FLAG_KEY];
  if (flag === "false") return false;
  return true;
}

export async function autoPlaceMidoceanOrder(cartId: string): Promise<AutoOrderResult> {
  if (!autoEnabled()) {
    return { skipped: true, reason: "MIDOCEAN_AUTO_PLACE_ON_PAYMENT=false" };
  }

  const cart = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    include: {
      items: { include: { markings: { orderBy: { order: "asc" } } } },
      purchaseOrders: true,
    },
  });
  if (!cart) return { ok: false, error: "Cart no encontrado" };

  if (cart.midoceanOrderId) {
    return { skipped: true, reason: `Ya tiene orderId ${cart.midoceanOrderId}` };
  }
  if (cart.items.length === 0) {
    return { skipped: true, reason: "Cart vacío" };
  }

  // Si hay PurchaseOrders (split aplicado), procesar SOLO el PO MidOcean.
  // Si no hay NINGÚN PO, procesar todos los items del cart (caso legacy:
  // carts anteriores al split, que por definición eran solo de MidOcean).
  const midoceanPO = cart.purchaseOrders.find((po) => po.supplier === "midocean");

  // Split hecho pero ningún PO es de MidOcean ⇒ este carrito no lleva
  // productos suyos y no hay nada que pedirles. Sin este corte se caía al
  // fallback de abajo y se les mandaba el carrito entero: un pedido a
  // MidOcean con SKUs de otro proveedor. Es el mismo corte que ya hacen
  // makito-auto-order y cifra-auto-order ("Sin PO X (no hay productos X en
  // este cart)"); MidOcean se quedó sin él porque es el único que carga
  // TODOS los POs del cart en vez de filtrar por su supplier.
  if (!midoceanPO && cart.purchaseOrders.length > 0) {
    return { skipped: true, reason: "El cart no tiene productos MidOcean" };
  }

  const itemsToProcess = midoceanPO
    ? cart.items.filter((it) => it.purchaseOrderId === midoceanPO.id)
    : cart.items;

  if (itemsToProcess.length === 0) {
    return { skipped: true, reason: "No hay items MidOcean en este cart" };
  }

  if (!cart.shippingAddress || !cart.shippingPostalCode || !cart.shippingCity) {
    // Notificar admin para revisión manual
    await notifyTelegram(
      `⚠️ <b>Pago recibido sin dirección completa</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nFalta shippingAddress/PostalCode/City — revisar en /admin/cart-quotes`,
    ).catch(() => {});
    return { skipped: true, reason: "Falta dirección de envío" };
  }

  const customerOrderRef = `merch-${cart.id.slice(0, 8)}`;

  const items: MidoceanOrderItem[] = itemsToProcess.map((it) => {
    // Si el cliente subió logo, lo enviamos a MidOcean como URL pública
    // absoluta para que ellos puedan descargarlo y producir con el artwork
    // correcto. Si la URL ya es absoluta (http/https), la usamos tal cual;
    // si es relativa (/files/...) la prefijamos con SITE_URL.
    let artworkUrl: string | undefined;
    if (it.customerLogoUrl) {
      artworkUrl = it.customerLogoUrl.startsWith("http")
        ? it.customerLogoUrl
        : `${SITE_URL}${it.customerLogoUrl}`;
    }
    // Construir print_positions: si hay markings[] (multi-marca), mapear cada uno.
    // Si no, intentar reconstruirlo desde campos planos (compat).
    const printPositions = it.markings && it.markings.length > 0
      ? it.markings.map((m) => ({
          position_id: m.positionId,
          printing_technique: m.techniqueCode,
          number_of_print_colors: m.numberOfColors,
          ...(artworkUrl ? { print_artwork_url: artworkUrl } : {}),
        }))
      : it.markingTechniqueCode && it.markingPositionId
        ? [{
            position_id: it.markingPositionId,
            printing_technique: it.markingTechniqueCode,
            number_of_print_colors: it.markingColours ?? 1,
            ...(artworkUrl ? { print_artwork_url: artworkUrl } : {}),
          }]
        : undefined;

    return {
      master_code: it.productRef,
      sku: it.variantSku || it.productRef,
      quantity: it.quantity,
      print_positions: printPositions,
    };
  });

  const payload: MidoceanCreateOrderPayload = {
    shipping_address: {
      company_name: cart.company || cart.name,
      contact_name: cart.name,
      street1: cart.shippingAddress,
      postal_code: cart.shippingPostalCode,
      city: cart.shippingCity,
      country: cart.shippingCountry || "ES",
      email: cart.email,
      phone: cart.phone || undefined,
      vat_number: cart.vatNumber || undefined,
    },
    customer_order_reference: customerOrderRef,
    remarks: cart.message || undefined,
    items,
  };

  const result = await midoceanOrders.createOrder(payload);

  if (result.dryRun) {
    await prisma.cartQuote.update({
      where: { id: cart.id },
      data: {
        midoceanOrderPayload: payload as unknown as Prisma.InputJsonValue,
        midoceanCustomerOrderRef: customerOrderRef,
      },
    });
    return { ok: true, dryRun: true, reason: result.reason };
  }

  if (!result.ok) {
    // Marcar PO como FAILED para que admin lo vea
    if (midoceanPO) {
      await prisma.purchaseOrder.update({
        where: { id: midoceanPO.id },
        data: {
          status: "FAILED",
          errorMessage: (result.error || "MidOcean error").slice(0, 4000),
        },
      }).catch(() => {});
    }
    await notifyTelegram(
      `❌ <b>MidOcean rechazó el pedido</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nStatus ${result.status} — ${(result.error || "").slice(0, 200)}`,
    ).catch(() => {});
    return { ok: false, error: result.error || "MidOcean error" };
  }

  await prisma.cartQuote.update({
    where: { id: cart.id },
    data: {
      midoceanOrderId: result.orderId,
      midoceanCustomerOrderRef: customerOrderRef,
      midoceanOrderPayload: payload as unknown as Prisma.InputJsonValue,
      midoceanOrderResponse: result.raw as Prisma.InputJsonValue,
      status: "ORDERED",
      orderedAt: new Date(),
    },
  });

  // Marcar PO MidOcean como PLACED (si hubo split)
  if (midoceanPO) {
    await prisma.purchaseOrder.update({
      where: { id: midoceanPO.id },
      data: {
        status: "PLACED",
        supplierOrderRef: result.orderId,
        placedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  await notifyTelegram(
    `📦 <b>Pedido enviado a MidOcean</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nMidOcean order: <code>${result.orderId}</code>`,
  ).catch(() => {});

  return { ok: true, orderId: result.orderId };
}
