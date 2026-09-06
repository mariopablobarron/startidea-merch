import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { PaymentAttemptError, startPaymentAttempt } from "@/lib/payment-attempts";
import { prisma } from "@/lib/prisma";
import { stripe as configuredStripe, STRIPE_MODE } from "@/lib/stripe";
import { withIva } from "@/lib/iva";
import { resolveSupplierOrderVariants } from "@/lib/supplier-order-variant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * Crea una Stripe Checkout Session para el depósito del CartQuote.
 * Devuelve la URL de la sesión hosted (redirect desde el cliente).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
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
      items: {
        select: {
          id: true,
          productSlug: true,
          productRef: true,
          variantSku: true,
        },
      },
    },
  });
  if (!cart) return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
  if (!cart.acceptedTotalCents || !cart.depositPercent) {
    return NextResponse.json({ error: "Cotización sin importe configurado" }, { status: 400 });
  }
  if (cart.payments.length > 0) {
    return NextResponse.json({ error: "Cotización ya pagada" }, { status: 409 });
  }
  if (cart.paymentLinkExpiresAt && cart.paymentLinkExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "Este enlace de pago ha caducado. Contáctanos para renovar tu cotización." },
      { status: 410 },
    );
  }

  // Preflight antes de crear una sesión Stripe: una línea con varias
  // variantes y sin SKU exacto no se puede cursar de forma segura.
  const supplierVariants = await resolveSupplierOrderVariants(cart.items);
  if (!supplierVariants.ok) {
    return NextResponse.json(
      {
        error: "Hay un producto cuya variante debe revisarse antes del pago.",
        detail: supplierVariants.error,
        code: supplierVariants.code,
      },
      { status: 422 },
    );
  }

  const baseDepositCents = Math.round((cart.acceptedTotalCents * cart.depositPercent) / 100);
  const isFull = cart.depositPercent >= 100;

  // Stripe Checkout Session — con Stripe Tax si está habilitado
  const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
  // Los precios son SIN IVA: añadimos el 21% al importe cobrado, SALVO que
  // Stripe Tax esté activo (entonces Stripe lo calcula y añadirlo aquí sería
  // IVA doble). (decisión Mario 2026-06-17 + caza de bugs)
  const amountCents = taxEnabled ? baseDepositCents : withIva(baseDepositCents);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    // Sin payment_method_types: Stripe muestra automáticamente todos los métodos
    // activos en Dashboard (card, Apple Pay, Google Pay, Link, SEPA, etc.) según
    // el dispositivo y región del cliente. Más conversión que limitar a card.
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
            tax_code: "txcd_99999999", // genérico — Stripe lo refina con la dirección
          },
        },
        quantity: 1,
      },
    ],
    customer_email: cart.email,
    success_url: `${SITE_URL}/pay/${token}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pay/${token}/cancel`,
    // Capturamos dirección + teléfono en Stripe para pasárselos a MidOcean
    // sin necesidad de un step extra en la web (más conversión).
    shipping_address_collection: {
      allowed_countries: [
        "ES", "PT", "FR", "IT", "DE", "AT", "BE", "NL", "LU", "IE",
        "GB", "DK", "SE", "FI", "NO", "PL", "CZ", "SK", "HU", "RO",
        "BG", "GR", "EE", "LV", "LT", "SI", "HR", "CY", "MT", "CH",
      ],
    },
    phone_number_collection: { enabled: true },
    // Stripe Tax: cuando esté activado, Stripe calcula IVA por país y permite
    // recoger NIF/VAT del cliente (B2B exempt si aplica)
    ...(taxEnabled
      ? {
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          customer_update: undefined,
          billing_address_collection: "required" as const,
        }
      : {}),
  };

  try {
    const session = await startPaymentAttempt({
      stripe, cart, mode: STRIPE_MODE, channel: "hosted",
      quote: {
        acceptedTotalCents: cart.acceptedTotalCents, depositPercent: cart.depositPercent,
        paymentLinkToken: token, amountCents, currency: "eur",
        kind: isFull ? "FULL" : "DEPOSIT", taxEnabled,
      },
      params: sessionParams,
      create: (snapshot, options) => stripe.checkout.sessions.create(
        snapshot.params as unknown as Stripe.Checkout.SessionCreateParams, options,
      ),
    });
    if (session.object !== "checkout.session" || !session.url) {
      throw new PaymentAttemptError(409, "No se ha podido preparar el pago. Vuelve a intentarlo.");
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    if (error instanceof PaymentAttemptError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[payment checkout] No se pudo preparar el intento", error instanceof Error ? error.name : "Error");
    return NextResponse.json({ error: "No se ha podido preparar el pago. Vuelve a intentarlo en unos instantes." }, { status: 503 });
  }
}
