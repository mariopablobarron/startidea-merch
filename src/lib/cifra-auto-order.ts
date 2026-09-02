/**
 * Auto-place del pedido Cifra tras pago confirmado en Stripe.
 *
 * Espejo de midocean-auto-order pero adaptado al API más simple de Cifra:
 *   - items: solo {model, quantity}. Sin print_positions (Cifra no acepta
 *     marcaje en el body del pedido; el marcaje se gestiona aparte por
 *     email/llamada con tu agente comercial).
 *   - shipping_address pide `zone` (provincia) que NO está en CartQuote.
 *     Usamos `shippingCity` como zone (pragmático; Cifra lo tolera).
 *
 * Flags:
 *   - CIFRA_AUTO_PLACE_ON_PAYMENT=false → no hace nada (manual)
 *   - CIFRA_LIVE_ORDERS=false → payload se construye pero NO se envía
 *     (dry run, marca PO con payload guardado en internalNotes).
 *     Default false hasta que Mario active explicitamente.
 *
 * Idempotente: si el PO Cifra ya tiene supplierOrderRef o status != PENDING,
 * no hace nada.
 */

import { prisma } from "@/lib/prisma";
import { createOrder, type CifraOrderPayload } from "@/lib/suppliers/cifra";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { provinciaFromPostalCodeOrCity } from "@/lib/spain-postal-code";
import { claimSupplierOrder, releaseSupplierOrderClaim } from "@/lib/supplier-order-claim";
import { resolveSupplierOrderVariants } from "@/lib/supplier-order-variant";

export type CifraAutoOrderResult =
  | { ok: true; orderId: string }
  | { ok: true; dryRun: true; reason: string }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

function autoEnabled(): boolean {
  // Default true. Mario puede desactivar con CIFRA_AUTO_PLACE_ON_PAYMENT=false.
  return process.env.CIFRA_AUTO_PLACE_ON_PAYMENT !== "false";
}

function liveOrdersEnabled(): boolean {
  // Default FALSE — Cifra es pedido real al proveedor, queremos que Mario
  // lo active explícitamente cuando confíe en el flow.
  return process.env.CIFRA_LIVE_ORDERS === "true";
}

const SUPPLIER = "cifra";

export async function autoPlaceCifraOrder(cartId: string): Promise<CifraAutoOrderResult> {
  if (!autoEnabled()) {
    return { skipped: true, reason: "CIFRA_AUTO_PLACE_ON_PAYMENT=false" };
  }

  // Mismo cerrojo que MidOcean, y puesto ANTES de que haga falta: hoy Cifra va
  // en simulación (`CIFRA_LIVE_ORDERS` no está activada), así que la carrera no
  // muerde. Pero el día que se active bastaría ese cambio de una variable de
  // entorno para abrir la ventana entera, y nadie tendría por qué acordarse de
  // este fichero. Lo protege también el guard estático de este directorio.
  if (!(await claimSupplierOrder(SUPPLIER, cartId))) {
    return { skipped: true, reason: "Ya hay otro proceso cursando este pedido" };
  }

  const contacto = { hecho: false };
  try {
    return await cursarPedidoCifra(cartId, contacto);
  } finally {
    if (!contacto.hecho) await releaseSupplierOrderClaim(SUPPLIER, cartId);
  }
}

async function cursarPedidoCifra(
  cartId: string,
  contacto: { hecho: boolean },
): Promise<CifraAutoOrderResult> {
  const cart = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    include: {
      items: true,
      purchaseOrders: { where: { supplier: "cifra" } },
    },
  });
  if (!cart) return { ok: false, error: "Cart no encontrado" };
  if (cart.items.length === 0) return { skipped: true, reason: "Cart vacío" };

  const cifraPO = cart.purchaseOrders[0];
  if (!cifraPO) return { skipped: true, reason: "Sin PO Cifra (no hay productos Cifra en este cart)" };

  // Idempotencia: si ya está placed o ya tiene supplierOrderRef, no repetir
  if (cifraPO.supplierOrderRef || cifraPO.status !== "PENDING") {
    return {
      skipped: true,
      reason: `PO Cifra ya en estado ${cifraPO.status} (ref ${cifraPO.supplierOrderRef ?? "—"})`,
    };
  }

  const cifraItems = cart.items.filter((it) => it.purchaseOrderId === cifraPO.id);
  if (cifraItems.length === 0) {
    return { skipped: true, reason: "PO Cifra sin items asignados" };
  }

  const supplierVariants = await resolveSupplierOrderVariants(cifraItems, "cifra");
  if (!supplierVariants.ok) {
    return { ok: false, error: supplierVariants.error };
  }

  // Validación dirección
  if (!cart.shippingAddress || !cart.shippingPostalCode || !cart.shippingCity) {
    await notifyTelegram(
      // `cart.name` lo teclea el cliente en el formulario de presupuesto:
      // "Fernández & Cía" o "<sin empresa>" bastan para que Telegram devuelva
      // 400. Este aviso es el único que dice que hay un pago cobrado sin
      // dirección; perderlo significa dinero cobrado y pedido sin salir.
      `⚠️ <b>Pago recibido sin dirección completa (Cifra)</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${escapeTgHtml(cart.name)}\nFalta shippingAddress/PostalCode/City — revisar en /admin/cart-quotes`,
    ).catch(() => {});
    return { skipped: true, reason: "Falta dirección de envío" };
  }

  // El helper devuelve un SKU exacto o corta antes del efecto externo.
  const items = cifraItems.map((it, index) => ({
    model: supplierVariants.items[index].sku,
    quantity: it.quantity,
  }));

  // Cifra pide `zone` (provincia). Lo derivamos del código postal español
  // (mapeo oficial Correos: primeros 2 dígitos del CP identifican la
  // provincia). Si el CP no es español o inválido, fallback a city.
  const zone = provinciaFromPostalCodeOrCity(cart.shippingPostalCode, cart.shippingCity);

  const payload: CifraOrderPayload = {
    commit: liveOrdersEnabled(),
    client_reference: `merch-${cart.id.slice(0, 8)}`,
    comment: cart.message?.slice(0, 500) || undefined,
    shipping_address: {
      firstname: cart.name,
      address_1: cart.shippingAddress,
      city: cart.shippingCity,
      zone,
      postcode: cart.shippingPostalCode,
      country: cart.shippingCountry || "ES",
      email: cart.email,
      telephone: cart.phone || undefined,
    },
    items,
  };

  // DRY RUN — payload guardado pero no enviado a Cifra
  if (!liveOrdersEnabled()) {
    await prisma.purchaseOrder.update({
      where: { id: cifraPO.id },
      data: {
        internalNotes: `[DRY RUN cifra ${new Date().toISOString()}]\n${JSON.stringify(payload, null, 2).slice(0, 3900)}`,
      },
    });
    return { ok: true, dryRun: true, reason: "CIFRA_LIVE_ORDERS=false (dry run)" };
  }

  // POST real a Cifra. A partir de aquí el pedido puede haber salido: el
  // cerrojo ya no se suelta (ver supplier-order-claim.ts).
  contacto.hecho = true;
  try {
    const response = await createOrder(payload);
    const orderId = String(response.data?.order_id || "");
    if (!orderId) {
      throw new Error(`Respuesta sin order_id: ${JSON.stringify(response).slice(0, 200)}`);
    }
    await prisma.purchaseOrder.update({
      where: { id: cifraPO.id },
      data: {
        status: "PLACED",
        supplierOrderRef: orderId,
        placedAt: new Date(),
        errorMessage: null,
        internalNotes: `Cifra response · order_id ${orderId} · total ${response.data?.total ?? "?"}€`,
      },
    });
    await notifyTelegram(
      // Mismo `cart.name` del cliente (ver arriba).
      `📦 <b>Pedido enviado a Cifra</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${escapeTgHtml(cart.name)}\nCifra order: <code>${orderId}</code>`,
    ).catch(() => {});
    return { ok: true, orderId };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await prisma.purchaseOrder.update({
      where: { id: cifraPO.id },
      data: {
        status: "FAILED",
        errorMessage: errMsg.slice(0, 4000),
      },
    });
    await notifyTelegram(
      // Además del nombre del cliente, `errMsg` viene de la API de Cifra y
      // puede traer un cuerpo HTML de error o un JSON con comillas y `&`.
      `❌ <b>Cifra rechazó el pedido</b>\nCart <code>${cart.id.slice(0, 8)}</code> de ${escapeTgHtml(cart.name)}\n${escapeTgHtml(errMsg.slice(0, 200))}`,
    ).catch(() => {});
    return { ok: false, error: errMsg };
  }
}
