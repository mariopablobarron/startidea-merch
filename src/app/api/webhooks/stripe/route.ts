import { after, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { applyStripePaymentEvent } from "@/lib/stripe-payment-events";
import { processStripePostPayment } from "@/lib/stripe-post-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** El ACK acredita la transacción local y su trabajo durable. El cron
 * webhook-retry recupera el postpago aunque el proceso muera tras ACK.
 */
export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook no configurado" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const result = await applyStripePaymentEvent(event);
    if (result.paymentId) {
      after(async () => {
        await processStripePostPayment(result.paymentId!).catch(() => {
          console.error("[stripe webhook] postpago pendiente de recuperación", result.paymentId);
        });
      });
    }
    return NextResponse.json({ received: true, ...(result.duplicate ? { duplicate: true, eventId: event.id } : {}) });
  } catch (error) {
    // Una unique ajena al recibo NO demuestra que el evento se completara.
    if ((error as { code?: string })?.code === "P2002") {
      const completed = await prisma.processedStripeEvent.findUnique({ where: { eventId: event.id } }).catch(() => null);
      if (completed?.eventType === event.type) {
        return NextResponse.json({ received: true, duplicate: true, eventId: event.id });
      }
    }
    console.error("[stripe webhook] evento pendiente de recuperación", event.id, event.type);
    return NextResponse.json({ error: "No se ha podido guardar el evento. Reintentar." }, { status: 500 });
  }
}
