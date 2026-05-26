import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram } from "@/lib/telegram";
import { markReferralEarned } from "@/lib/referral";
import { recordCouponRedemption } from "@/lib/affiliates";
import { autoPlaceMidoceanOrder } from "@/lib/midocean-auto-order";
import { autoPlaceCifraOrder } from "@/lib/cifra-auto-order";
import { autoPlaceMakitoOrder } from "@/lib/makito-auto-order";
import { createPurchaseOrdersFromCart } from "@/lib/purchase-orders";
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
        cartTotalCents: amountCents,
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
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">

        <!-- Header con check verde grande -->
        <div style="padding:40px 32px 24px;text-align:center;">
          <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:#4a9d7f;color:#FFFFFF;font-size:32px;font-weight:bold;margin-bottom:20px;">✓</div>
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Pago confirmado</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#2A2A2A;">
            Gracias ${firstName}.<br>
            <span style="color:#E63E73;">Pasamos a producción.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Hemos recibido tu pago de <strong>${amountFmt} €</strong>. Tu pedido entra
            en cola de producción ahora mismo.
          </p>
        </div>

        ${portalLink ? `
        <!-- CTA portal cliente -->
        <div style="padding:0 32px 8px;text-align:center;">
          <a href="${portalLink}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Ver estado de mi pedido →</a>
          <p style="margin:12px 0 0;font-size:11px;color:#a09e98;line-height:1.5;">
            Acceso a tu portal: tracking, factura, mockups y proofs.<br>
            Enlace válido 7 días — después solicita uno nuevo en
            <a href="${SITE_URL}/clientes/login" style="color:#6b6b6b;">${SITE_URL.replace("https://", "")}/clientes/login</a>
          </p>
        </div>
        ` : ""}

        <!-- Qué pasa ahora -->
        <div style="margin:32px;padding:24px;background:#F4EFE6;border-radius:12px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Qué pasa ahora</p>
          <ol style="margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:#2A2A2A;">
            <li><strong>Mockup de aprobación</strong> (si lleva personalización) — te lo enviamos para revisión antes de imprimir nada.</li>
            <li><strong>Producción</strong> — fabricamos en Centros Especiales de Empleo y talleres certificados.</li>
            <li><strong>Envío</strong> — recibirás email con tracking del transportista en cuanto salga.</li>
            <li><strong>Entrega</strong> — 7-15 días laborables salvo urgencia coordinada.</li>
          </ol>
        </div>

        <!-- Recibo Stripe + ID corto -->
        <div style="padding:0 32px 24px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#6b6b6b;">
            Referencia de tu pedido:
            <code style="background:#F4EFE6;padding:2px 8px;border-radius:4px;color:#2A2A2A;font-weight:600;">${cartId.slice(0, 8).toUpperCase()}</code>
          </p>
          ${receiptUrl ? `
          <p style="margin:12px 0 0;font-size:13px;">
            <a href="${receiptUrl}" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">Descargar recibo Stripe →</a>
          </p>
          ` : ""}
        </div>

        <!-- Contacto rápido -->
        <div style="padding:0 32px 24px;text-align:center;border-top:1px solid #E8E2D5;padding-top:24px;">
          <p style="margin:0;font-size:13px;color:#444;">
            ¿Algo no encaja? Estamos a un email:
          </p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.8;">
            <a href="https://wa.me/34958045789" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">WhatsApp +34 958 045 789</a><br>
            <a href="mailto:pedidos@startidea.es" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">pedidos@startidea.es</a>
          </p>
        </div>

        <!-- Footer brand -->
        <div style="background:#2A2A2A;padding:24px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">
            todo<span style="color:#E63E73;">merchandising</span>
          </p>
          <p style="margin:8px 0 0;">
            Una iniciativa de Startidea · Agencia de Innovación Social<br>
            STARTIDEA MALAGA SL · CIF B19583632 · C/ Conde Cifuentes, 33 — 18005 Granada
          </p>
        </div>
      </div>
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
