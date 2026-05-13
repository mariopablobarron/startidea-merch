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
    include: { items: true },
  });
  if (!cart) return { ok: false, error: "Cart no encontrado" };

  if (cart.midoceanOrderId) {
    return { skipped: true, reason: `Ya tiene orderId ${cart.midoceanOrderId}` };
  }
  if (cart.items.length === 0) {
    return { skipped: true, reason: "Cart vacío" };
  }

  if (!cart.shippingAddress || !cart.shippingPostalCode || !cart.shippingCity) {
    // Notificar admin para revisión manual
    await notifyTelegram(
      `⚠️ <b>Pago recibido sin dirección completa</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nFalta shippingAddress/PostalCode/City — revisar en /admin/cart-quotes`,
    ).catch(() => {});
    return { skipped: true, reason: "Falta dirección de envío" };
  }

  const customerOrderRef = `merch-${cart.id.slice(0, 8)}`;

  const items: MidoceanOrderItem[] = cart.items.map((it) => ({
    master_code: it.productRef,
    sku: it.variantSku || it.productRef,
    quantity: it.quantity,
    print_positions:
      it.markingTechniqueCode && it.markingPositionId
        ? [
            {
              position_id: it.markingPositionId,
              printing_technique: it.markingTechniqueCode,
              number_of_print_colors: it.markingColours ?? 1,
            },
          ]
        : undefined,
  }));

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

  await notifyTelegram(
    `📦 <b>Pedido enviado a MidOcean</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nMidOcean order: <code>${result.orderId}</code>`,
  ).catch(() => {});

  return { ok: true, orderId: result.orderId };
}
