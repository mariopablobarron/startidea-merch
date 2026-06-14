import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const Schema = z.object({
  acceptedTotalCents: z.number().int().positive().max(100_000_000), // <= 1M EUR
  depositPercent: z.number().int().min(1).max(100),
  sendEmail: z.boolean().optional().default(true),
  // Validez del enlace en días (urgencia + protege margen ante cambio de tarifas).
  validityDays: z.number().int().min(1).max(90).optional().default(14),
});

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Genera (o regenera) el link de pago para un CartQuote y manda email
 * al cliente con CTA "Pagar X €". El cliente lo paga vía /pay/[token].
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { name: true, email: true, paymentLinkToken: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  const token = cart.paymentLinkToken || `pay_${randomBytes(20).toString("base64url")}`;
  const depositCents = Math.round((parsed.data.acceptedTotalCents * parsed.data.depositPercent) / 100);
  const expiresAt = new Date(Date.now() + parsed.data.validityDays * 24 * 60 * 60 * 1000);
  const expiresLabel = expiresAt.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  await prisma.cartQuote.update({
    where: { id },
    data: {
      acceptedTotalCents: parsed.data.acceptedTotalCents,
      depositPercent: parsed.data.depositPercent,
      paymentLinkToken: token,
      paymentLinkSentAt: parsed.data.sendEmail ? new Date() : undefined,
      paymentLinkExpiresAt: expiresAt,
      status: "SENT",
    },
  });

  const url = `${SITE_URL}/pay/${token}`;

  if (parsed.data.sendEmail && resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: cart.email,
        subject: `${cart.name.split(" ")[0]}, tu cotización está lista — pago seguro online`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
            <h2 style="font-family:Georgia,serif;color:#0a0a0b;">Tu cotización está lista</h2>
            <p>Hola ${cart.name.split(" ")[0]},</p>
            <p>Hemos cerrado los detalles de tu cotización. Total negociado:</p>
            <p style="font-size:28px;font-weight:600;text-align:center;margin:20px 0;">${EUR.format(parsed.data.acceptedTotalCents / 100)}</p>
            <p style="text-align:center;color:#666;margin-bottom:24px;">Depósito a pagar ahora (${parsed.data.depositPercent}%): <strong>${EUR.format(depositCents / 100)}</strong></p>
            <p style="text-align:center;margin:28px 0;">
              <a href="${url}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Pagar de forma segura →</a>
            </p>
            <p style="text-align:center;font-size:13px;color:#888;">Este enlace y precio son válidos hasta el <strong>${expiresLabel}</strong>.</p>
            <p style="font-size:13px;color:#666;">Pago procesado por Stripe. Aceptamos Visa, Mastercard, Apple Pay, Google Pay y Bizum. SSL verificado.</p>
            <p style="color:#888;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
          </div>`,
      })
      .catch((err) => console.error("[payment-link email]", err));
  }

  return NextResponse.json({
    ok: true,
    token,
    url,
    acceptedTotalCents: parsed.data.acceptedTotalCents,
    depositPercent: parsed.data.depositPercent,
    depositCents,
    expiresAt: expiresAt.toISOString(),
  });
}
