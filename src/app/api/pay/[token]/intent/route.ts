import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_MODE } from "@/lib/stripe";
import { withIva } from "@/lib/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crea un PaymentIntent para usar con Express Checkout Element (Apple Pay,
 * Google Pay, Link) directamente en la página /pay/[token]. Devuelve el
 * client_secret que Stripe.js necesita para confirmar el pago.
 *
 * Diferencia con /api/pay/[token]/checkout:
 *  - checkout → crea Checkout Session hosted, redirige al usuario a Stripe
 *  - intent  → crea PaymentIntent, el pago ocurre en nuestra propia página
 *               vía Stripe Elements (botón nativo Apple/Google Pay)
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe no configurado", hint: "Falta STRIPE_SECRET_KEY en envs." },
      { status: 503 },
    );
  }

  const { token } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { paymentLinkToken: token },
    include: {
      payments: { where: { status: "PAID" } },
      items: { select: { id: true } },
    },
  });
  if (!cart) return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
  if (!cart.acceptedTotalCents || !cart.depositPercent) {
    return NextResponse.json({ error: "Cotización sin importe configurado" }, { status: 400 });
  }
  if (cart.payments.length > 0) {
    return NextResponse.json({ error: "Cotización ya pagada" }, { status: 409 });
  }
  // Validar caducidad igual que el flujo hosted (antes este endpoint wallet no
  // la comprobaba → se podía cobrar sobre un enlace caducado). (bug-bounty)
  if (cart.paymentLinkExpiresAt && cart.paymentLinkExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "Este enlace de pago ha caducado. Contáctanos para renovar tu cotización." },
      { status: 410 },
    );
  }

  // Precios SIN IVA → el cobro añade el 21%. Este flujo no usa Stripe Tax, así
  // que siempre se añade aquí. (decisión Mario 2026-06-17 + caza de bugs)
  const amountCents = withIva(Math.round((cart.acceptedTotalCents * cart.depositPercent) / 100));
  const isFull = cart.depositPercent >= 100;

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "eur",
    receipt_email: cart.email,
    description: isFull
      ? `Pago total cotización — ${cart.company || cart.name}`
      : `Depósito ${cart.depositPercent}% — ${cart.company || cart.name}`,
    // automatic_payment_methods: Stripe activa los métodos disponibles para el
    // cliente según el browser/región (Apple Pay, Google Pay, Link, card, etc.)
    automatic_payment_methods: { enabled: true },
    metadata: {
      cartId: cart.id,
      paymentLinkToken: token,
      depositPercent: String(cart.depositPercent),
      kind: isFull ? "FULL" : "DEPOSIT",
      source: "express-checkout",
    },
  });

  // Persistir Payment PENDING — el webhook lo marcará PAID al confirmarse.
  // Si ya existía un PENDING para este cart (caso: usuario abrió la página
  // dos veces) no creamos duplicado, actualizamos el más reciente.
  const existing = await prisma.payment.findFirst({
    where: { cartId: cart.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: { stripePaymentIntentId: intent.id, amountCents },
    });
  } else {
    await prisma.payment.create({
      data: {
        cartId: cart.id,
        amountCents,
        currency: "EUR",
        status: "PENDING",
        kind: isFull ? "FULL" : "DEPOSIT",
        stripeMode: STRIPE_MODE,
        stripePaymentIntentId: intent.id,
      } satisfies Prisma.PaymentUncheckedCreateInput,
    });
  }

  return NextResponse.json({
    ok: true,
    clientSecret: intent.client_secret,
    amountCents,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
}
