import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { markReferralEarned } from "@/lib/referral";
import { recordCouponRedemption } from "@/lib/affiliates";
import { autoPlaceMidoceanOrder } from "@/lib/midocean-auto-order";
import { autoPlaceCifraOrder } from "@/lib/cifra-auto-order";
import { autoPlaceMakitoOrder } from "@/lib/makito-auto-order";
import { createPurchaseOrdersFromCart } from "@/lib/purchase-orders";
import { createPostPaymentMagicLink } from "@/lib/customer-portal-magic";
import { syncPaymentToFacturaScripts } from "@/lib/facturascripts-sync";
import { IVA_RATE } from "@/lib/iva";
import { internalPaymentEmailHtml, clientPaidEmailHtml } from "@/lib/stripe-paid-emails";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe necesita el body raw para validar la firma
export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook no configurado" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid signature", detail: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  // ── Idempotencia: Stripe garantiza at-least-once, así que el mismo
  // evt_xxx puede llegar 2+ veces. Intentamos crear la fila ANTES de
  // procesar; si la unique constraint salta (P2002), ya se procesó y
  // respondemos 200 sin duplicar pedido / email / referral.
  try {
    await prisma.processedStripeEvent.create({
      data: { eventId: event.id, eventType: event.type },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return NextResponse.json({ received: true, duplicate: true, eventId: event.id });
    }
    throw err;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        await handleSessionFailed(event.data.object as Stripe.Checkout.Session, "async_payment_failed");
        break;
      case "checkout.session.expired":
        await handleSessionFailed(event.data.object as Stripe.Checkout.Session, "expired");
        break;
      case "payment_intent.succeeded":
        // Para Express Checkout (Apple/Google Pay nativos en /pay/[token]).
        // Stripe Checkout también dispara este evento, pero ya lo manejamos
        // en checkout.session.completed; aquí solo procesamos los que
        // NO vinieron de una checkout session.
        await handleIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handleIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(charge);
        break;
      }
      default:
        // Ignorar eventos no relevantes
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] ${event.type}`, err);
    // 200 para no provocar reintentos infinitos por bugs nuestros — log en server
  }

  return NextResponse.json({ received: true });
}

async function handleSessionCompleted(session: Stripe.Checkout.Session) {
  const payment = await prisma.payment.findUnique({
    where: { stripeSessionId: session.id },
    include: { cart: { select: { id: true, name: true, email: true, company: true } } },
  });
  if (!payment) {
    console.warn("[stripe webhook] session sin Payment local:", session.id);
    return;
  }

  // Recuperar PaymentIntent para receipt url
  let receiptUrl: string | undefined;
  let paymentIntentId: string | undefined;
  if (typeof session.payment_intent === "string") {
    paymentIntentId = session.payment_intent;
    try {
      const pi = await stripe!.paymentIntents.retrieve(session.payment_intent, { expand: ["latest_charge"] });
      const latestCharge = pi.latest_charge as Stripe.Charge | null;
      receiptUrl = latestCharge?.receipt_url ?? undefined;
    } catch {}
  }

  // Extraer dirección de envío del Stripe Checkout (capturada via
  // shipping_address_collection). Stripe usa "collected_information"
  // en versiones nuevas o "shipping_details" en anteriores; manejamos
  // ambos para robustez.
  type ShippingDetails = {
    address?: { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; country?: string | null };
    phone?: string | null;
  };
  const shipping: ShippingDetails | undefined =
    (session as unknown as { collected_information?: { shipping_details?: ShippingDetails } })
      .collected_information?.shipping_details ||
    (session as unknown as { shipping_details?: ShippingDetails }).shipping_details;
  const customerPhone = session.customer_details?.phone ?? null;
  const shippingPatch: {
    shippingAddress?: string;
    shippingPostalCode?: string;
    shippingCity?: string;
    shippingCountry?: string;
    phone?: string;
  } = {};
  if (shipping?.address) {
    const a = shipping.address;
    shippingPatch.shippingAddress = [a.line1, a.line2].filter(Boolean).join(", ").slice(0, 300);
    shippingPatch.shippingPostalCode = a.postal_code || undefined;
    shippingPatch.shippingCity = a.city || undefined;
    shippingPatch.shippingCountry = a.country || "ES";
  }
  if (customerPhone) shippingPatch.phone = customerPhone;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      stripeReceiptUrl: receiptUrl,
    },
  });

  await prisma.cartQuote.update({
    where: { id: payment.cartId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      ...shippingPatch,
    },
  });

  await postPaymentAutoflow({
    cartId: payment.cartId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    customer: payment.cart,
    receiptUrl,
    via: "checkout",
  });
}

async function handleIntentSucceeded(intent: Stripe.PaymentIntent) {
  // Buscar Payment local por stripePaymentIntentId (sólo los creados por
  // Express Checkout — los de Checkout Session ya están marcados como PAID
  // por handleSessionCompleted antes de que llegue este evento).
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: intent.id },
    include: { cart: { select: { id: true, name: true, email: true, company: true } } },
  });
  if (!payment || payment.status === "PAID") return; // ya procesado

  let receiptUrl: string | undefined;
  if (typeof intent.latest_charge === "string") {
    try {
      const charge = await stripe!.charges.retrieve(intent.latest_charge);
      receiptUrl = charge.receipt_url ?? undefined;
    } catch {}
  }

  // Express Checkout puede llevar shipping info en el PaymentIntent
  const shipping = intent.shipping;
  const shippingPatch: {
    shippingAddress?: string;
    shippingPostalCode?: string;
    shippingCity?: string;
    shippingCountry?: string;
    phone?: string;
  } = {};
  if (shipping?.address) {
    const a = shipping.address;
    shippingPatch.shippingAddress = [a.line1, a.line2].filter(Boolean).join(", ").slice(0, 300);
    shippingPatch.shippingPostalCode = a.postal_code || undefined;
    shippingPatch.shippingCity = a.city || undefined;
    shippingPatch.shippingCountry = a.country || "ES";
  }
  if (shipping?.phone) shippingPatch.phone = shipping.phone;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripeReceiptUrl: receiptUrl,
    },
  });

  await prisma.cartQuote.update({
    where: { id: payment.cartId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      ...shippingPatch,
    },
  });

  await postPaymentAutoflow({
    cartId: payment.cartId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    customer: payment.cart,
    receiptUrl,
    via: "express-checkout",
  });
}

/**
 * Autoflow tras un pago confirmado (Checkout o Express):
 *  1. Marca referral earned
 *  2. Notifica Telegram al equipo
 *  3. Emite webhook payment.completed para integradores
 *  4. Auto-place pedido a MidOcean (si MIDOCEAN_LIVE_ORDERS=true y hay
 *     dirección). Si no, queda manual desde admin (log warning).
 *  5. Crea CustomerUser si no existía + magic link 7d
 *  6. Email cliente con link al portal + email interno equipo
 *
 * Errores en MidOcean/email NO fallan el webhook (200 OK siempre).
 */
async function postPaymentAutoflow(args: {
  cartId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  customer: { name: string; email: string; company: string | null };
  receiptUrl?: string;
  via: "checkout" | "express-checkout";
}) {
  const { cartId, paymentId, amountCents, currency, customer, receiptUrl, via } = args;
  const firstName = customer.name.split(" ")[0];
  const amountFmt = (amountCents / 100).toFixed(2);

  // Cargamos items para email interno con logos descargables
  const cartWithItems = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    select: {
      acceptedTotalCents: true,
      items: {
        select: {
          productName: true,
          productRef: true,
          quantity: true,
          customerLogoUrl: true,
          customerLogoFilename: true,
          markingTechniqueName: true,
          markingPositionId: true,
          markingColours: true,
        },
      },
    },
  });
  const affiliateBaseCents =
    cartWithItems?.acceptedTotalCents ?? Math.round(amountCents / (1 + IVA_RATE));

  void markReferralEarned(cartId, affiliateBaseCents).catch((e) =>
    console.error("[stripe webhook] markReferralEarned falló:", e instanceof Error ? e.message : e),
  );

  // F2 (25-may): si el cart se pagó con un cupón vinculado a afiliado,
  // crea entries COMMISSION + CREDIT en el ledger del partner.
  // - Idempotente: recordCouponRedemption ya dedupe por (cartId, kind).
  // - Si el cupón no tiene afiliado, el helper devuelve null silenciosamente.
  // - Si el evt_xxx llega 2 veces, processedStripeEvent ya nos blinda; este
  //   helper es defense-in-depth.
  void prisma.couponRedemption
    .findUnique({ where: { cartId }, select: { couponId: true } })
    .then((redemption) => {
      if (!redemption) return null;
      return recordCouponRedemption({
        cartId,
        couponId: redemption.couponId,
        cartTotalCents: affiliateBaseCents,
      });
    })
    .then((res) => {
      if (res) {
        console.log(
          "[stripe webhook] affiliate-ledger",
          cartId,
          `commission=${res.commissionCents}`,
          `credit=${res.creditCents}`,
        );
      }
    })
    .catch((err) => console.error("[stripe webhook affiliate-ledger]", err));

  const viaLabel = via === "express-checkout" ? " (Apple/Google Pay)" : "";
  void notifyTelegram(
    `💰 <b>Pago recibido</b>${viaLabel}\n${escapeTgHtml(customer.name)}${customer.company ? ` · ${escapeTgHtml(customer.company)}` : ""}\n<b>${amountFmt} €</b>\n📧 ${customer.email}`,
  ).catch((e) =>
    console.error("[stripe webhook] notifyTelegram pago recibido falló:", e instanceof Error ? e.message : e),
  );

  void emitWebhook("payment.completed", {
    cartId,
    paymentId,
    amountCents,
    currency,
    paidAt: new Date().toISOString(),
    via,
  });

  // 1) Split del cart en PurchaseOrders (idempotente · 1 PO por supplier)
  void createPurchaseOrdersFromCart(cartId)
    .then((pos) => {
      console.log("[stripe webhook] purchaseOrders created", cartId, pos.map((p) => `${p.supplier}:${p.id}`));
      // 2) Auto-place por proveedor (cada adaptador filtra sus propios items)
      //   - MidOcean: API completa con printdata. Default ON.
      //   - Cifra: API simple sin marcaje. Default DRY RUN hasta confirmar
      //     CIFRA_LIVE_ORDERS=true.
      //   - Makito: sin API pública, queda PENDING para gestión manual.
      void autoPlaceMidoceanOrder(cartId)
        .then((res) => console.log("[stripe webhook] autoPlaceMidocean", cartId, res))
        .catch((err) => console.error("[stripe webhook autoPlaceMidocean]", err));
      void autoPlaceCifraOrder(cartId)
        .then((res) => console.log("[stripe webhook] autoPlaceCifra", cartId, res))
        .catch((err) => console.error("[stripe webhook autoPlaceCifra]", err));
      // Makito: no tiene POST orders en API. Notifica Telegram con
      // el desglose + marca internalNotes idempotente.
      void autoPlaceMakitoOrder(cartId)
        .then((res) => console.log("[stripe webhook] autoPlaceMakito", cartId, res))
        .catch((err) => console.error("[stripe webhook autoPlaceMakito]", err));
    })
    .catch((err) => console.error("[stripe webhook purchaseOrders]", err));

  // Magic link al portal para que el cliente vea estado del pedido
  let portalLink: string | null = null;
  try {
    portalLink = await createPostPaymentMagicLink(customer.email, customer.name);
  } catch (err) {
    console.error("[stripe webhook magic-link]", err);
  }

  // Emails de confirmación de pago. sendEmail dispara alerta Telegram
  // automática si Resend falla — un cliente que paga y NO recibe email
  // de confirmación es disputa segura.
  void Promise.all([
    sendEmail({
      to: RESEND_TO_INTERNAL,
      subject: `[Pago recibido] ${customer.name}${customer.company ? " · " + customer.company : ""} · ${amountFmt}€${via === "express-checkout" ? " (wallet)" : ""}`,
      html: internalPaymentEmailHtml({
        customer,
        amountFmt,
        cartId,
        viaLabel,
        receiptUrl,
        items: cartWithItems?.items || [],
      }),
      context: `stripe paid · ${cartId}`,
    }),
    sendEmail({
      to: customer.email,
      subject: `Hemos recibido tu pago — gracias ${firstName}`,
      html: clientPaidEmailHtml({ firstName, amountFmt, cartId, portalLink, receiptUrl }),
      context: `stripe paid client · ${cartId}`,
    }),
  ]);

  // Sincronizar con FacturaScripts (emite factura legal en facturas.startidea.tech,
  // idempresa=2 STARTIDEA MALAGA SL). Idempotente: si el Payment ya tiene
  // fsInvoiceCode, no hace nada. Errores se guardan en Payment.fsError para
  // reintento manual desde admin; NO rompen el flujo del webhook (Stripe debe
  // recibir 200 OK siempre).
  // GATE: la emisión automática de factura solo se ejecuta si está habilitada
  // explícitamente. Mientras el modelo de IVA cobro↔factura no esté resuelto
  // (Stripe cobra base; la factura saldría base×1,21 → descuadre legal), este
  // camino queda OFF por defecto. Encender con FACTURASCRIPTS_SYNC_ENABLED=true
  // SOLO tras decidir el IVA. `simulate-payment` (admin manual) NO está gateado.
  if (process.env.FACTURASCRIPTS_SYNC_ENABLED === "true") {
    void syncPaymentToFacturaScripts(paymentId)
      .then((res) => {
        if (res.ok) {
          console.log(
            "[stripe webhook] fs-sync",
            paymentId,
            res.alreadySynced ? "(ya sincronizado)" : `→ factura ${res.fsInvoiceCode}`,
          );
        } else {
          console.error("[stripe webhook fs-sync]", paymentId, res.error);
        }
      })
      .catch((err) => console.error("[stripe webhook fs-sync exception]", paymentId, err));
  } else {
    console.log("[stripe webhook] fs-sync OFF (FACTURASCRIPTS_SYNC_ENABLED!=true)", paymentId);
  }
}

async function handleIntentFailed(intent: Stripe.PaymentIntent) {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: intent.id, status: "PENDING" },
    data: {
      status: "FAILED",
      failureReason: intent.last_payment_error?.message || "payment_intent.payment_failed",
    },
  });
}

async function handleSessionFailed(session: Stripe.Checkout.Session, reason: string) {
  await prisma.payment.updateMany({
    where: { stripeSessionId: session.id, status: "PENDING" },
    data: { status: reason === "expired" ? "CANCELED" : "FAILED", failureReason: reason },
  });
}

async function handleRefund(charge: Stripe.Charge) {
  if (!charge.payment_intent || typeof charge.payment_intent !== "string") return;
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: charge.payment_intent, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
}
