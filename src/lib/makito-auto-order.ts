/**
 * Auto-order Makito tras pago Stripe. Makito NO tiene endpoint POST de
 * orders en su API REST (sólo lectura del catálogo). Workflow:
 *
 *   1. Detectar PO Makito PENDING en el cart
 *   2. Construir desglose legible (items, qty, marcaje, dirección)
 *   3. Notificar a admin (Telegram + email) con el pedido formateado
 *      para que Mario lo procese manualmente en Makito B2B
 *   4. Marcar PO como PENDING con internalNotes (no PLACED — sólo PLACED
 *      cuando Mario lo confirme en /admin)
 *
 * Idempotente: si ya se notificó (internalNotes tiene marca), no repite.
 */

import { prisma } from "@/lib/prisma";
import { notifyTelegram } from "@/lib/telegram";

export type MakitoAutoOrderResult =
  | { ok: true; notified: true; poId: string }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

function autoEnabled(): boolean {
  return process.env.MAKITO_AUTO_PLACE_ON_PAYMENT !== "false";
}

export async function autoPlaceMakitoOrder(cartId: string): Promise<MakitoAutoOrderResult> {
  if (!autoEnabled()) {
    return { skipped: true, reason: "MAKITO_AUTO_PLACE_ON_PAYMENT=false" };
  }

  const cart = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    include: {
      items: true,
      purchaseOrders: { where: { supplier: "makito" } },
    },
  });
  if (!cart) return { ok: false, error: "Cart no encontrado" };
  if (cart.items.length === 0) return { skipped: true, reason: "Cart vacío" };

  const makitoPO = cart.purchaseOrders[0];
  if (!makitoPO) {
    return { skipped: true, reason: "Sin PO Makito (no hay productos Makito en este cart)" };
  }

  // Idempotencia: ya notificado en internalNotes?
  if (makitoPO.internalNotes?.includes("[MAKITO_NOTIFIED]")) {
    return { skipped: true, reason: "Ya notificado anteriormente" };
  }

  const makitoItems = cart.items.filter((it) => it.purchaseOrderId === makitoPO.id);
  if (makitoItems.length === 0) {
    return { skipped: true, reason: "PO Makito sin items" };
  }

  // Validación dirección
  if (!cart.shippingAddress || !cart.shippingPostalCode || !cart.shippingCity) {
    await notifyTelegram(
      `⚠️ <b>Pago recibido sin dirección completa (Makito)</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${cart.name}\nFalta shippingAddress/PostalCode/City — revisar en /admin/cart-quotes`,
    ).catch(() => {});
    return { skipped: true, reason: "Falta dirección de envío" };
  }

  // Construir desglose para Telegram
  const lines = [
    `🚨 <b>PEDIDO MAKITO · ACCIÓN MANUAL</b>`,
    `Cart <code>${cart.id.slice(0, 8)}</code>`,
    `Cliente: ${cart.name}${cart.company ? " · " + cart.company : ""}`,
    `Email: ${cart.email}${cart.phone ? " · " + cart.phone : ""}`,
    ``,
    `<b>Envío a:</b>`,
    `  ${cart.shippingAddress}`,
    `  ${cart.shippingPostalCode} ${cart.shippingCity}${cart.shippingCountry ? " (" + cart.shippingCountry + ")" : ""}`,
    ``,
    `<b>Items (${makitoItems.length}):</b>`,
  ];
  for (const it of makitoItems) {
    const ref = it.variantSku || it.productRef;
    const marking = it.markingTechniqueName ? ` · marcaje ${it.markingTechniqueName}` : "";
    lines.push(`  · ${it.quantity}× <code>${ref}</code> — ${it.productName}${marking}`);
  }
  lines.push("");
  lines.push(`<b>Total cliente:</b> ${(makitoPO.totalClientCents / 100).toFixed(2)} €`);
  lines.push(``);
  lines.push(`👉 Hacer pedido en Makito B2B + actualizar PO en <a href="https://merchandising.startidea.es/admin/cart-quotes/${cart.id}">/admin/cart-quotes/${cart.id.slice(0, 8)}</a>`);

  await notifyTelegram(lines.join("\n")).catch(() => {});

  // Guardar info en internalNotes del PO + marca de notificado (idempotencia)
  const noteSummary = [
    `[MAKITO_NOTIFIED ${new Date().toISOString()}]`,
    `Items: ${makitoItems.length}`,
    `Cliente: ${cart.name} <${cart.email}>`,
    `Envío: ${cart.shippingAddress}, ${cart.shippingPostalCode} ${cart.shippingCity}`,
    `Total: ${(makitoPO.totalClientCents / 100).toFixed(2)}€`,
    ``,
    `Desglose:`,
    ...makitoItems.map(
      (it) =>
        `  · ${it.quantity}× ${it.variantSku || it.productRef} — ${it.productName}${it.markingTechniqueName ? " · " + it.markingTechniqueName : ""}`,
    ),
  ].join("\n");

  await prisma.purchaseOrder.update({
    where: { id: makitoPO.id },
    data: {
      internalNotes: noteSummary.slice(0, 3900),
    },
  });

  return { ok: true, notified: true, poId: makitoPO.id };
}
