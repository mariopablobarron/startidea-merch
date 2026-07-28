import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import {
  emailShell,
  emailHeader,
  emailPara,
  emailButton,
  emailFinePrint,
  escapeHtml,
} from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
const COOLDOWN_HOURS = 48; // mismo enviado dos veces seguidas en <48h = no.

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Envía recordatorio "ups, se te quedó en el carrito" al cliente del CartQuote.
 *
 * Reglas:
 *  - solo si CartQuote.status ∈ {NEW, IN_PROGRESS} (si ya está SENT/CONFIRMED no tiene sentido)
 *  - solo si reminderSentAt es NULL o > 48h (anti-spam)
 *  - incrementa reminderCount + actualiza reminderSentAt
 *  - genera link "recover" para que el cliente vuelva: /cotizar?recover={cartId}
 *
 * Cuerpo opcional: { customMessage?: string } — admin puede personalizar el body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { customMessage?: string };

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      status: true,
      reminderSentAt: true,
      reminderCount: true,
      estimatedTotalCents: true,
      items: {
        select: { quantity: true, productName: true, primaryImageUrl: true, totalClientCents: true },
        take: 6,
      },
    },
  });
  if (!cart) return NextResponse.json({ error: "Cart no encontrado" }, { status: 404 });

  // Sólo abandonados reales
  if (!(cart.status === "NEW" || cart.status === "IN_PROGRESS")) {
    return NextResponse.json(
      { error: `No abandonado (status=${cart.status}). El recordatorio solo aplica a NEW/IN_PROGRESS.` },
      { status: 409 },
    );
  }

  // Anti-spam: cooldown de 48h
  if (cart.reminderSentAt) {
    const hoursSince = (Date.now() - cart.reminderSentAt.getTime()) / 3_600_000;
    if (hoursSince < COOLDOWN_HOURS) {
      return NextResponse.json(
        {
          error: `Cooldown activo. Ya enviado hace ${Math.floor(hoursSince)}h. Próximo envío disponible en ${Math.ceil(COOLDOWN_HOURS - hoursSince)}h.`,
        },
        { status: 429 },
      );
    }
  }

  const recoverUrl = `${SITE_URL}/cotizar?recover=${cart.id}`;
  const firstName = cart.name.split(" ")[0] || "";

  const itemsHtml = cart.items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E8E2D5;font-size:14px;color:#2A2A2A;">
          <strong>${it.quantity}×</strong> ${escapeHtml(it.productName)}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #E8E2D5;text-align:right;font-size:14px;color:#6b6b6b;font-weight:600;white-space:nowrap;">
          ${it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : ""}
        </td>
      </tr>`,
    )
    .join("");

  const totalLine = cart.estimatedTotalCents
    ? `
    <tr>
      <td style="padding:18px 0 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Total estimado</td>
      <td style="padding:18px 0 0;text-align:right;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#E63E73;">${EUR.format(cart.estimatedTotalCents / 100)}</td>
    </tr>`
    : "";

  const customBlock = body.customMessage
    ? `<tr><td style="padding:20px 40px 0"><div style="padding:16px;background:#FBDFE9;border-left:3px solid #E63E73;border-radius:8px;font-size:14px;line-height:1.5;color:#2A2A2A;">${escapeHtml(body.customMessage)}</div></td></tr>`
    : "";

  const subject =
    cart.reminderCount === 0
      ? `${firstName ? firstName + ", t" : "T"}u cotización en TodoMerchandising te espera`
      : `${firstName ? firstName + ", n" : "N"}o pierdas tu cotización pendiente`;

  const result = await sendEmail({
    to: cart.email,
    subject,
    context: `cart-quote remind · ${cart.id}`,
    html: emailShell(
      emailHeader(
        "Te esperamos",
        `Hola ${escapeHtml(firstName || cart.name)}.<br><span style="color:#a09e98;font-weight:400">Tu cotización sigue aquí.</span>`,
      ) +
        emailPara(
          "Te dejaste algunos productos a medio configurar. Los hemos guardado por si quieres retomarlo.",
        ) +
        `<tr><td style="padding:20px 40px 0">
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #E8E2D5;">${itemsHtml}${totalLine}</table>
        </td></tr>` +
        customBlock +
        emailButton(recoverUrl, "Retomar mi cotización →") +
        `<tr><td style="padding:0 40px;text-align:center">
          <p style="margin:0;font-size:13px;color:#6b6b6b;line-height:1.5">Si necesitas mockup técnico, plazo cerrado o condiciones especiales, te lo cerramos en menos de 24h laborables.</p>
          <p style="margin:12px 0 0;font-size:14px"><a href="https://wa.me/34958045789" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px">WhatsApp +34 958 045 789</a></p>
        </td></tr>` +
        emailFinePrint(`Si no quieres más recordatorios, responde "BAJA" a este email.`),
      "Tu cotización sigue guardada — retómala cuando quieras",
    ),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Resend no pudo enviar el recordatorio" },
      { status: 502 },
    );
  }

  await prisma.cartQuote.update({
    where: { id: cart.id },
    data: {
      reminderSentAt: new Date(),
      reminderCount: { increment: 1 },
    },
  });

  return NextResponse.json({
    ok: true,
    sentTo: cart.email,
    reminderCount: cart.reminderCount + 1,
  });
}
