import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
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
          <strong>${it.quantity}×</strong> ${it.productName}
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
    ? `<div style="margin:24px 32px;padding:16px;background:#FBDFE9;border-left:3px solid #E63E73;border-radius:8px;font-size:14px;line-height:1.5;color:#2A2A2A;">${body.customMessage.replace(/</g, "&lt;")}</div>`
    : "";

  const subject =
    cart.reminderCount === 0
      ? `${firstName ? firstName + ", t" : "T"}u cotización en TodoMerchandising te espera`
      : `${firstName ? firstName + ", n" : "N"}o pierdas tu cotización pendiente`;

  const result = await sendEmail({
    to: cart.email,
    subject,
    context: `cart-quote remind · ${cart.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">

        <!-- Header con eyebrow + título -->
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Te esperamos</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName || cart.name}.<br>
            <span style="color:#a09e98;">Tu cotización sigue aquí.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Te dejaste algunos productos a medio configurar. Los hemos guardado por
            si quieres retomarlo.
          </p>
        </div>

        <!-- Items -->
        <div style="padding:0 32px;">
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #E8E2D5;">
            ${itemsHtml}
            ${totalLine}
          </table>
        </div>

        ${customBlock}

        <!-- CTA primario -->
        <div style="padding:24px 32px;text-align:center;">
          <a href="${recoverUrl}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Retomar mi cotización →</a>
          <p style="margin:16px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;">
            Si necesitas mockup técnico, plazo cerrado o condiciones especiales,
            te lo cerramos en menos de 24h laborables.
          </p>
        </div>

        <!-- Contacto humano -->
        <div style="padding:0 32px 32px;border-top:1px solid #E8E2D5;padding-top:24px;">
          <p style="margin:0;font-size:13px;color:#444;text-align:center;">
            ¿Prefieres que te llamemos? Responde a este email o:
          </p>
          <p style="margin:8px 0 0;font-size:14px;line-height:2;text-align:center;">
            <a href="https://wa.me/34958045789" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">WhatsApp +34 958 045 789</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">
            todo<span style="color:#E63E73;">merchandising</span>
          </p>
          <p style="margin:6px 0 0;">
            STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es<br>
            <span style="color:rgba(244,239,230,0.5);">Si no quieres más recordatorios, responde "BAJA" a este email.</span>
          </p>
        </div>
      </div>
    </div>`,
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
