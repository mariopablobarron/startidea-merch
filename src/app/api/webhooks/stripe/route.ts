import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram } from "@/lib/telegram";
import { markReferralEarned } from "@/lib/referral";
import { autoPlaceMidoceanOrder } from "@/lib/midocean-auto-order";
import { createPostPaymentMagicLink } from "@/lib/customer-portal-magic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

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

  void markReferralEarned(cartId, amountCents).catch(() => {});

  const viaLabel = via === "express-checkout" ? " (Apple/Google Pay)" : "";
  void notifyTelegram(
    `💰 <b>Pago recibido</b>${viaLabel}\n${customer.name}${customer.company ? ` · ${customer.company}` : ""}\n<b>${amountFmt} €</b>\n📧 ${customer.email}`,
  ).catch(() => {});

  void emitWebhook("payment.completed", {
    cartId,
    paymentId,
    amountCents,
    currency,
    paidAt: new Date().toISOString(),
    via,
  });

  // Auto-place a MidOcean (fire-and-forget; resultado va a Telegram)
  void autoPlaceMidoceanOrder(cartId)
    .then((res) => {
      console.log("[stripe webhook] autoPlaceMidocean", cartId, res);
    })
    .catch((err) => console.error("[stripe webhook autoPlace]", err));

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
}

function internalPaymentEmailHtml(args: {
  customer: { name: string; email: string; company: string | null };
  amountFmt: string;
  cartId: string;
  viaLabel: string;
  receiptUrl?: string;
  items: Array<{
    productName: string;
    productRef: string;
    quantity: number;
    customerLogoUrl: string | null;
    customerLogoFilename: string | null;
    markingTechniqueName: string | null;
    markingPositionId: string | null;
    markingColours: number | null;
  }>;
}): string {
  const { customer, amountFmt, cartId, viaLabel, receiptUrl, items } = args;
  const adminUrl = `${SITE_URL}/admin/cart-quotes/${cartId}`;

  const logosBlock = items
    .filter((it) => it.customerLogoUrl)
    .map((it) => {
      const logoAbsUrl = it.customerLogoUrl!.startsWith("http")
        ? it.customerLogoUrl
        : `${SITE_URL}${it.customerLogoUrl}`;
      const marking = it.markingTechniqueName
        ? ` · ${it.markingTechniqueName} en ${it.markingPositionId}${it.markingColours && it.markingColours > 1 ? ` (${it.markingColours} col.)` : ""}`
        : "";
      return `<li style="margin:8px 0;">
        <strong>${it.productName}</strong> (${it.productRef}) × ${it.quantity}${marking}<br>
        <a href="${logoAbsUrl}" style="color:#E63E73;">📥 ${it.customerLogoFilename || "Logo cliente"}</a>
      </li>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,sans-serif;max-width:680px;color:#2A2A2A;">
    <h2 style="font-family:Georgia,serif;">Pago recibido vía Stripe${viaLabel}</h2>
    <p><strong>Cliente:</strong> ${customer.name} (${customer.email})${customer.company ? `<br><strong>Empresa:</strong> ${customer.company}` : ""}</p>
    <p><strong>Importe:</strong> ${amountFmt} €</p>
    <p><strong>Cart ID:</strong> <code>${cartId}</code></p>

    ${logosBlock
      ? `<h3 style="font-family:Georgia,serif;margin-top:24px;">Logos a descargar para MidOcean</h3>
         <ul style="padding-left:20px;">${logosBlock}</ul>`
      : '<p style="color:#888;font-size:13px;">Sin logos personalizados subidos.</p>'}

    <p style="margin-top:24px;">
      <a href="${adminUrl}" style="background:#E63E73;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Abrir cart en admin →</a>
    </p>

    <p style="color:#888;font-size:12px;margin-top:16px;">
      Auto-flow MidOcean: revisa Telegram para resultado (placed/dryRun/error).
      ${receiptUrl ? `<br><a href="${receiptUrl}">Ver recibo Stripe</a>` : ""}
    </p>
  </div>`;
}

function clientPaidEmailHtml(args: {
  firstName: string;
  amountFmt: string;
  cartId: string;
  portalLink: string | null;
  receiptUrl?: string;
}): string {
  const { firstName, amountFmt, cartId, portalLink, receiptUrl } = args;
  return `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
    <h2 style="font-family:Georgia,serif;color:#2A2A2A;">Pago recibido ✓</h2>
    <p>Hola ${firstName},</p>
    <p>Hemos recibido tu pago de <strong>${amountFmt} €</strong>. Pasamos producción a marcha.</p>
    <p>Referencia de pedido: <code>${cartId.slice(0, 8)}</code></p>

    ${portalLink ? `
    <p style="text-align:center;margin:32px 0;">
      <a href="${portalLink}" style="background:#E63E73;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Ver estado de mi pedido →</a>
    </p>
    <p style="font-size:13px;color:#6b6b6b;">Este enlace te da acceso directo a tu portal de cliente para seguir el estado del pedido, descargar factura y ver tracking de envío cuando esté disponible. Vale 7 días; después puedes solicitar uno nuevo en <a href="${SITE_URL}/clientes/login" style="color:#E63E73;">${SITE_URL.replace("https://", "")}/clientes/login</a>.</p>
    ` : ""}

    ${receiptUrl ? `<p><a href="${receiptUrl}" style="color:#E63E73;">Descargar recibo Stripe →</a></p>` : ""}

    <hr style="border:0;border-top:1px solid #eee;margin:32px 0;">
    <h3 style="font-family:Georgia,serif;font-size:16px;">¿Qué pasa ahora?</h3>
    <ol style="padding-left:20px;color:#444;line-height:1.6;">
      <li><strong>Producción:</strong> tu pedido entra en cola. Te enviamos un mockup de aprobación si tu pedido lleva personalización.</li>
      <li><strong>Envío:</strong> recibirás email con código de seguimiento del transportista.</li>
      <li><strong>Entrega:</strong> 7-15 días laborables salvo urgencia coordinada.</li>
    </ol>

    <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">
      STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es · +34 958 045 789
    </p>
  </div>`;
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
