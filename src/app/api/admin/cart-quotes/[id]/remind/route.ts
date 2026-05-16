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
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${it.quantity}× ${it.productName}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">${
          it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : ""
        }</td>
      </tr>`,
    )
    .join("");

  const totalLine = cart.estimatedTotalCents
    ? `<p style="margin-top:16px;font-size:18px;color:#0a0a0b;"><strong>Total estimado: ${EUR.format(cart.estimatedTotalCents / 100)}</strong></p>`
    : "";

  const customBlock = body.customMessage
    ? `<p style="margin:24px 0;padding:16px;background:#fff3eb;border-left:3px solid #ff6b35;border-radius:6px;">${body.customMessage.replace(/</g, "&lt;")}</p>`
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
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;line-height:1.5;">
  <h2 style="font-family:Georgia,serif;font-size:26px;color:#0a0a0b;margin:0 0 8px;">Hola ${firstName || cart.name},</h2>
  <p style="font-size:16px;color:#444;">Te dejaste algunos productos en tu cotización y no queremos que se te pasen. Esto es lo que tenías:</p>

  <table style="width:100%;margin-top:20px;font-size:14px;">
    ${itemsHtml}
  </table>
  ${totalLine}

  ${customBlock}

  <p style="margin-top:24px;">Si aún te interesa, podemos cerrarte la cotización con tarifas finales en <strong>menos de 24h</strong>. Solo nos hace falta confirmar cantidades y técnica de marcaje.</p>

  <div style="margin:32px 0;">
    <a href="${recoverUrl}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">Retomar mi cotización →</a>
  </div>

  <p style="color:#888;font-size:13px;">¿Prefieres que te llamemos? Responde a este email o escríbenos por WhatsApp y te marcamos en 1h laboral.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="color:#888;font-size:12px;margin:0;">
    STARTIDEA MALAGA SL · CIF B19583632 · Málaga, España<br>
    Si no quieres más recordatorios, responde "BAJA" a este email.
  </p>
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
