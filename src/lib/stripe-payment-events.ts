import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueStripePostPayment } from "@/lib/stripe-post-payment";
import { parsePaymentAttemptSnapshot } from "@/lib/payment-attempts";
import { readPaymentItemsFingerprint } from "@/lib/payment-quote-fingerprint";

type Tx = Prisma.TransactionClient;
type EventResult = { paymentId?: string; duplicate?: boolean };
const includeCart = {
  cart: { select: { id: true, name: true, email: true, company: true, status: true, acceptedTotalCents: true, depositPercent: true, paymentLinkToken: true } },
} as const;
type PaymentWithCart = Prisma.PaymentGetPayload<{ include: typeof includeCart }>;

/** Recibo, confirmación y trabajo posterior se confirman juntos. Serializable
 * arbitra eventos diferentes del mismo pago y dos pagos del mismo carrito.
 * No se espera ninguna API externa dentro de la transacción.
 */
export async function applyStripePaymentEvent(event: Stripe.Event): Promise<EventResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.processedStripeEvent.findUnique({ where: { eventId: event.id } });
        if (existing) return { duplicate: true };
        await tx.processedStripeEvent.create({ data: { eventId: event.id, eventType: event.type } });
        switch (event.type) {
          case "checkout.session.completed":
          case "checkout.session.async_payment_succeeded":
            return confirmSession(tx, event.data.object as Stripe.Checkout.Session, event.livemode);
          case "payment_intent.succeeded":
            return confirmIntent(tx, event.data.object as Stripe.PaymentIntent, event.livemode);
          case "checkout.session.async_payment_failed":
          case "checkout.session.expired": {
            const session = event.data.object as Stripe.Checkout.Session;
            const payment = await findPayment(tx, "stripeSessionId", session.id, session.metadata);
            if (payment) {
              checkMode(payment, event.livemode);
              await tx.payment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: { stripeSessionId: session.id, status: event.type.endsWith("expired") ? "CANCELED" : "FAILED", failureReason: event.type },
              });
            }
            return {};
          }
          case "payment_intent.payment_failed": {
            const intent = event.data.object as Stripe.PaymentIntent;
            if (intent.metadata?.source === "hosted-checkout") return {};
            const payment = await findPayment(tx, "stripePaymentIntentId", intent.id, intent.metadata);
            if (payment) {
              checkMode(payment, event.livemode);
              await tx.payment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: { stripePaymentIntentId: intent.id, status: "FAILED", failureReason: "payment_intent.payment_failed" },
              });
            }
            return {};
          }
          case "charge.refunded": {
            const charge = event.data.object as Stripe.Charge;
            const id = objectId(charge.payment_intent);
            if (id && charge.refunded) {
              // Un reembolso puede adelantarse a la entrega que asocia el PI a
              // su Payment. Conservar el hecho evita confirmar ese pago luego.
              await tx.adminSetting.upsert({
                where: { key: refundKey(id, event.livemode) },
                create: { key: refundKey(id, event.livemode), value: { chargeId: charge.id } }, update: {},
              });
              const payment = await findPayment(tx, "stripePaymentIntentId", id, charge.metadata);
              if (payment) {
                checkMode(payment, event.livemode);
                await tx.payment.updateMany({
                  where: { id: payment.id, status: { in: ["PENDING", "FAILED", "PAID", "CANCELED"] } },
                  data: { stripePaymentIntentId: id, status: "REFUNDED", refundedAt: new Date() },
                });
              }
            }
            return {};
          }
          default:
            return {};
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
}

function objectId(value: string | { id: string } | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}
const refundKey = (id: string, live: boolean) => `stripe_full_refund:${live ? "live" : "test"}:${id}`;

function checkMode(payment: PaymentWithCart, livemode: boolean) {
  if (payment.stripeMode && payment.stripeMode !== (livemode ? "live" : "test")) {
    throw new Error("Modo Stripe no coincide con el intento");
  }
}

async function findPayment(tx: Tx, field: "stripeSessionId" | "stripePaymentIntentId", id: string, metadata: Stripe.Metadata | null): Promise<PaymentWithCart | null> {
  const where = field === "stripeSessionId" ? { stripeSessionId: id } : { stripePaymentIntentId: id };
  let payment = await tx.payment.findUnique({ where, include: includeCart });
  // El Payment se reserva antes de Stripe: la entrega puede preceder al guardado
  // del id remoto. Reparar solo una asociación vacía del MISMO intento/carrito.
  if (!payment && metadata?.paymentId) {
    payment = await tx.payment.findUnique({ where: { id: metadata.paymentId }, include: includeCart });
    if (payment && (payment.cartId !== metadata.cartId || (payment[field] && payment[field] !== id))) {
      throw new Error("La asociación Stripe no coincide con el intento");
    }
  }
  if (!payment && metadata?.cartId) throw new Error("El pago local todavía no está disponible");
  if (payment && ((metadata?.cartId && metadata.cartId !== payment.cartId) || (metadata?.paymentId && metadata.paymentId !== payment.id))) {
    throw new Error("Metadata Stripe no coincide con el pago local");
  }
  return payment;
}

async function confirmSession(tx: Tx, session: Stripe.Checkout.Session, livemode: boolean): Promise<EventResult> {
  // Terminar Checkout no acredita la liquidación de un método diferido.
  if (session.payment_status !== "paid") return {};
  const payment = await findPayment(tx, "stripeSessionId", session.id, session.metadata);
  if (!payment) return {};
  checkMode(payment, livemode);
  const intentId = objectId(session.payment_intent);
  if (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== intentId) throw new Error("Intento remoto diferente");
  const charged = session.amount_total;
  const taxTotal = session.automatic_tax?.enabled === true && session.amount_subtotal === payment.amountCents;
  if (session.currency?.toUpperCase() !== payment.currency.toUpperCase() || !Number.isSafeInteger(charged) || !charged || charged < payment.amountCents || (charged !== payment.amountCents && !taxTotal)) {
    throw new Error("El cobro no coincide con el importe registrado");
  }
  if (intentId && await applyEarlyRefund(tx, payment, intentId, livemode, { stripeSessionId: session.id, amountCents: charged })) return {};
  if (payment.status === "REFUNDED" || payment.status === "PAID") return {};
  const shipping = (session as unknown as { collected_information?: { shipping_details?: Shipping }; shipping_details?: Shipping });
  const details = shipping.collected_information?.shipping_details || shipping.shipping_details;
  const expandedIntent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = expandedIntent && typeof expandedIntent.latest_charge === "object" ? expandedIntent.latest_charge : null;
  return confirmPayment(tx, payment, {
    stripeSessionId: session.id, stripePaymentIntentId: intentId,
    amountCents: charged, stripeReceiptUrl: charge?.receipt_url ?? undefined,
  }, shippingPatch(details, session.customer_details?.phone), "checkout");
}

async function confirmIntent(tx: Tx, intent: Stripe.PaymentIntent, livemode: boolean): Promise<EventResult> {
  if (intent.status !== "succeeded") return {};
  // Hosted se confirma con su sesión: incluye dirección y total definitivo.
  if (intent.metadata?.source === "hosted-checkout") return {};
  const payment = await findPayment(tx, "stripePaymentIntentId", intent.id, intent.metadata);
  if (!payment || payment.stripeSessionId) return {};
  checkMode(payment, livemode);
  if (intent.currency.toUpperCase() !== payment.currency.toUpperCase() || intent.amount !== payment.amountCents || intent.amount_received !== payment.amountCents) {
    throw new Error("El cobro no coincide con el importe registrado");
  }
  if (await applyEarlyRefund(tx, payment, intent.id, livemode)) return {};
  if (payment.status === "REFUNDED" || payment.status === "PAID") return {};
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  return confirmPayment(tx, payment, { stripePaymentIntentId: intent.id, stripeReceiptUrl: charge?.receipt_url ?? undefined }, shippingPatch(intent.shipping, intent.shipping?.phone), "express-checkout");
}

async function applyEarlyRefund(tx: Tx, payment: PaymentWithCart, intentId: string, live: boolean, patch: Prisma.PaymentUpdateManyMutationInput = {}): Promise<boolean> {
  const refund = await tx.adminSetting.findUnique({ where: { key: refundKey(intentId, live) } });
  if (!refund) return false;
  await tx.payment.updateMany({
    where: { id: payment.id, status: { in: ["PENDING", "FAILED", "CANCELED", "PAID", "REFUNDED"] } },
    data: { ...patch, stripePaymentIntentId: intentId, status: "REFUNDED", refundedAt: new Date() },
  });
  return true;
}

type Shipping = { address?: { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; country?: string | null } | null; phone?: string | null };
function shippingPatch(shipping: Shipping | null | undefined, phone?: string | null) {
  const data: { shippingAddress?: string; shippingPostalCode?: string; shippingCity?: string; shippingCountry?: string; phone?: string } = {};
  if (shipping?.address) {
    const a = shipping.address;
    data.shippingAddress = [a.line1, a.line2].filter(Boolean).join(", ").slice(0, 300);
    data.shippingPostalCode = a.postal_code || undefined;
    data.shippingCity = a.city || undefined;
    data.shippingCountry = a.country || "ES";
  }
  if (phone) data.phone = phone;
  return data;
}

async function confirmPayment(tx: Tx, payment: PaymentWithCart, paymentPatch: Prisma.PaymentUpdateManyMutationInput, address: ReturnType<typeof shippingPatch>, via: "checkout" | "express-checkout"): Promise<EventResult> {
  const alreadyPaid = await tx.payment.findFirst({ where: { cartId: payment.cartId, status: "PAID", id: { not: payment.id } }, select: { id: true } });
  const owner = await tx.adminSetting.findUnique({ where: { key: `stripe_post_payment_cart:${payment.cartId}` } });
  const priorOwner = owner?.value as { paymentId?: string } | null;
  const hasPriorOwner = !!owner && priorOwner?.paymentId !== payment.id;
  const attempt = await tx.adminSetting.findUnique({ where: { key: `payment_attempt:${payment.id}` } });
  const snapshot = parsePaymentAttemptSnapshot(attempt?.value);
  const unverified = !snapshot?.quote.itemsFingerprint || snapshot.legacy === true || snapshot.paymentId !== payment.id || snapshot.cartId !== payment.cartId;
  const termsChanged = snapshot?.quote && (
    snapshot.quote.acceptedTotalCents !== payment.cart.acceptedTotalCents ||
    snapshot.quote.depositPercent !== payment.cart.depositPercent ||
    snapshot.quote.paymentLinkToken !== payment.cart.paymentLinkToken ||
    snapshot.quote.itemsFingerprint !== await readPaymentItemsFingerprint(tx, payment.cartId)
  );
  const review = alreadyPaid || hasPriorOwner ? "Pago confirmado adicional: revisar y conciliar antes de cursar otro pedido." : unverified ? "Pago confirmado sin versión original verificable: revisar antes de cursar el pedido." : termsChanged ? "Pago confirmado sobre una versión anterior: revisar antes de cursar el pedido." : null;
  const changed = await tx.payment.updateMany({
    where: { id: payment.id, status: { in: ["PENDING", "FAILED", "CANCELED"] } },
    data: { ...paymentPatch, status: "PAID", paidAt: new Date(), failureReason: review },
  });
  if (changed.count !== 1) return {};
  if (review) {
    const current = await tx.cartQuote.findUnique({ where: { id: payment.cartId }, select: { internalNotes: true } });
    const note = `[Pago ${payment.id}] ${review}`;
    if (current && !current.internalNotes?.includes(note)) await tx.cartQuote.update({
      where: { id: payment.cartId }, data: { internalNotes: [current.internalNotes, note].filter(Boolean).join("\n") },
    });
    return {};
  }
  await tx.cartQuote.update({
    where: { id: payment.cartId },
    data: { ...(payment.cart.status === "ORDERED" ? {} : { status: "CONFIRMED" as const, confirmedAt: new Date() }), ...address },
  });
  const amount = typeof paymentPatch.amountCents === "number" ? paymentPatch.amountCents : payment.amountCents;
  await enqueueStripePostPayment(tx, {
    cartId: payment.cartId, paymentId: payment.id, amountCents: amount, currency: payment.currency,
    customer: payment.cart, receiptUrl: typeof paymentPatch.stripeReceiptUrl === "string" ? paymentPatch.stripeReceiptUrl : undefined, via,
  });
  return { paymentId: payment.id };
}
