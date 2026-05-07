import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram } from "@/lib/telegram";
import { markReferralEarned } from "@/lib/referral";

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
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  // Si el cart vino de un referral, devengar comisión
  void markReferralEarned(payment.cartId, payment.amountCents).catch(() => {});

  // Telegram al equipo
  void notifyTelegram(
    `💰 <b>Pago recibido</b>\n${payment.cart.name}${payment.cart.company ? ` · ${payment.cart.company}` : ""}\n<b>${(payment.amountCents / 100).toFixed(2)} €</b>\n📧 ${payment.cart.email}`,
  ).catch(() => {});

  // Webhook a clientes API
  void emitWebhook("payment.completed", {
    cartId: payment.cartId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    paidAt: new Date().toISOString(),
  });

  // Email al equipo + cliente
  if (resend) {
    void Promise.all([
      resend.emails.send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Pago recibido] ${payment.cart.name}${payment.cart.company ? " · " + payment.cart.company : ""} · ${(payment.amountCents / 100).toFixed(2)}€`,
        html: `<p>Pago recibido vía Stripe.</p><p>Cliente: ${payment.cart.name} (${payment.cart.email})</p><p>Importe: ${(payment.amountCents / 100).toFixed(2)} €</p><p>Cart ID: <code>${payment.cartId}</code></p>${receiptUrl ? `<p><a href="${receiptUrl}">Ver recibo Stripe</a></p>` : ""}`,
      }),
      resend.emails.send({
        from: RESEND_FROM,
        to: payment.cart.email,
        subject: `Hemos recibido tu pago — gracias ${payment.cart.name.split(" ")[0]}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">Pago recibido ✓</h2>
          <p>Hola ${payment.cart.name.split(" ")[0]},</p>
          <p>Hemos recibido tu pago de <strong>${(payment.amountCents / 100).toFixed(2)} €</strong>. Pasamos producción a marcha y te avisaremos cuando esté listo.</p>
          ${receiptUrl ? `<p><a href="${receiptUrl}" style="color:#ff6b35;">Descargar recibo →</a></p>` : ""}
          <p style="margin-top:24px;color:#888;font-size:12px;">STARTIDEA MALAGA SL · CIF B19583632</p>
        </div>`,
      }),
    ]).catch((err) => console.error("[stripe webhook resend]", err));
  }
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
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  void markReferralEarned(payment.cartId, payment.amountCents).catch(() => {});

  void notifyTelegram(
    `💰 <b>Pago recibido</b> (Apple/Google Pay)\n${payment.cart.name}${payment.cart.company ? ` · ${payment.cart.company}` : ""}\n<b>${(payment.amountCents / 100).toFixed(2)} €</b>\n📧 ${payment.cart.email}`,
  ).catch(() => {});

  void emitWebhook("payment.completed", {
    cartId: payment.cartId,
    paymentId: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    paidAt: new Date().toISOString(),
    via: "express-checkout",
  });

  if (resend) {
    void Promise.all([
      resend.emails.send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Pago recibido] ${payment.cart.name}${payment.cart.company ? " · " + payment.cart.company : ""} · ${(payment.amountCents / 100).toFixed(2)}€ (wallet)`,
        html: `<p>Pago recibido vía Apple/Google Pay (Express Checkout).</p><p>Cliente: ${payment.cart.name} (${payment.cart.email})</p><p>Importe: ${(payment.amountCents / 100).toFixed(2)} €</p><p>Cart ID: <code>${payment.cartId}</code></p>${receiptUrl ? `<p><a href="${receiptUrl}">Ver recibo Stripe</a></p>` : ""}`,
      }),
      resend.emails.send({
        from: RESEND_FROM,
        to: payment.cart.email,
        subject: `Hemos recibido tu pago — gracias ${payment.cart.name.split(" ")[0]}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">Pago recibido ✓</h2>
          <p>Hola ${payment.cart.name.split(" ")[0]},</p>
          <p>Hemos recibido tu pago de <strong>${(payment.amountCents / 100).toFixed(2)} €</strong>. Pasamos producción a marcha y te avisaremos cuando esté listo.</p>
          ${receiptUrl ? `<p><a href="${receiptUrl}" style="color:#ff6b35;">Descargar recibo →</a></p>` : ""}
          <p style="margin-top:24px;color:#888;font-size:12px;">STARTIDEA MALAGA SL · CIF B19583632</p>
        </div>`,
      }),
    ]).catch((err) => console.error("[stripe webhook resend]", err));
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
