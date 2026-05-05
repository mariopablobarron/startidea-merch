import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_MODE } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Crea una Stripe Checkout Session para el depósito del CartQuote.
 * Devuelve la URL de la sesión hosted (redirect desde el cliente).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe no configurado", hint: "Falta STRIPE_SECRET_KEY en envs." },
      { status: 503 },
    );
  }

  const { token } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { paymentLinkToken: token },
    include: { payments: { where: { status: "PAID" } }, items: { select: { id: true } } },
  });
  if (!cart) return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
  if (!cart.acceptedTotalCents || !cart.depositPercent) {
    return NextResponse.json({ error: "Cotización sin importe configurado" }, { status: 400 });
  }
  if (cart.payments.length > 0) {
    return NextResponse.json({ error: "Cotización ya pagada" }, { status: 409 });
  }

  const amountCents = Math.round((cart.acceptedTotalCents * cart.depositPercent) / 100);
  const isFull = cart.depositPercent >= 100;

  // Stripe Checkout Session — modo "payment", pago único
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: amountCents,
          product_data: {
            name: isFull
              ? `Pago total cotización — ${cart.company || cart.name}`
              : `Depósito ${cart.depositPercent}% cotización — ${cart.company || cart.name}`,
            description: `Ref. interna: ${cart.id.slice(0, 8)} · ${cart.items.length} productos`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: cart.email,
    success_url: `${SITE_URL}/pay/${token}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pay/${token}/cancel`,
    metadata: {
      cartId: cart.id,
      paymentLinkToken: token,
      depositPercent: String(cart.depositPercent),
      kind: isFull ? "FULL" : "DEPOSIT",
    },
  });

  // Persistir Payment PENDING para luego matchear en webhook
  await prisma.payment.create({
    data: {
      cartId: cart.id,
      amountCents,
      currency: "EUR",
      status: "PENDING",
      kind: isFull ? "FULL" : "DEPOSIT",
      stripeMode: STRIPE_MODE,
      stripeSessionId: session.id,
    } satisfies Prisma.PaymentUncheckedCreateInput,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
