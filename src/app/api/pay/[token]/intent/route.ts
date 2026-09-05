import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { PaymentAttemptError, startPaymentAttempt } from "@/lib/payment-attempts";
import { prisma } from "@/lib/prisma";
import { stripe as configuredStripe, STRIPE_MODE } from "@/lib/stripe";
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
  const stripe = configuredStripe;
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

  try {
    const intent = await startPaymentAttempt({
      stripe, cart, mode: STRIPE_MODE, channel: "wallet",
      quote: {
        acceptedTotalCents: cart.acceptedTotalCents, depositPercent: cart.depositPercent,
        paymentLinkToken: token, amountCents, currency: "eur",
        kind: isFull ? "FULL" : "DEPOSIT", taxEnabled: false,
      },
      params: {
        amount: amountCents,
        currency: "eur",
        receipt_email: cart.email,
        description: isFull
          ? `Pago total cotización — ${cart.company || cart.name}`
          : `Depósito ${cart.depositPercent}% — ${cart.company || cart.name}`,
        automatic_payment_methods: { enabled: true },
      },
      create: (snapshot, options) => stripe.paymentIntents.create(
        snapshot.params as unknown as Stripe.PaymentIntentCreateParams, options,
      ),
    });
    if (intent.object !== "payment_intent" || !intent.client_secret) {
      throw new PaymentAttemptError(409, "No se ha podido preparar el pago. Vuelve a intentarlo.");
    }

    return NextResponse.json({
      ok: true,
      clientSecret: intent.client_secret,
      amountCents,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    });
  } catch (error) {
    if (error instanceof PaymentAttemptError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[payment intent] No se pudo preparar el intento", error instanceof Error ? error.name : "Error");
    return NextResponse.json({ error: "No se ha podido preparar el pago. Vuelve a intentarlo en unos instantes." }, { status: 503 });
  }
}
