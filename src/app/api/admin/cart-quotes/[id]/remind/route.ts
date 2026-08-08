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
 *
 * El cooldown se RECLAMA antes de enviar, no se comprueba y luego se apunta:
 * esto lo dispara un botón del panel, y dos clics seguidos leían los dos un
 * `reminderSentAt` todavía vacío y mandaban dos recordatorios al MISMO cliente.
 * Es la misma forma que ya se corrigió en los drips (`599a91e`) y en la
 * publicación en redes (`8b0c615`): el efecto externo no puede vivir entre el
 * «¿ya está hecho?» y el «apúntalo».
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

  // Anti-spam: cooldown de 48h, RECLAMADO de forma atómica. La condición viaja
  // dentro del propio UPDATE, así que de dos clics solapados solo uno cuenta
  // filas y solo ese llega a enviar.
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 3_600_000);
  const claim = await prisma.cartQuote.updateMany({
    where: {
      id: cart.id,
      status: { in: ["NEW", "IN_PROGRESS"] },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: cooldownCutoff } }],
    },
    data: { reminderSentAt: new Date(), reminderCount: { increment: 1 } },
  });

  if (claim.count === 0) {
    // Perdimos la reclamación: o hay cooldown vivo, o el otro clic acaba de
    // enviarlo. Se relee para dar el motivo real en vez de adivinarlo.
    const actual = await prisma.cartQuote.findUnique({
      where: { id: cart.id },
      select: { status: true, reminderSentAt: true },
    });
    if (actual && !(actual.status === "NEW" || actual.status === "IN_PROGRESS")) {
      return NextResponse.json(
        { error: `No abandonado (status=${actual.status}). El recordatorio solo aplica a NEW/IN_PROGRESS.` },
        { status: 409 },
      );
    }
    const hoursSince = actual?.reminderSentAt
      ? (Date.now() - actual.reminderSentAt.getTime()) / 3_600_000
      : 0;
    return NextResponse.json(
      {
        error: `Cooldown activo. Ya enviado hace ${Math.floor(hoursSince)}h. Próximo envío disponible en ${Math.ceil(COOLDOWN_HOURS - hoursSince)}h.`,
      },
      { status: 429 },
    );
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
    // Resend contestó que NO lo ha enviado: se devuelve el cooldown a como
    // estaba para que el admin pueda reintentar en el acto en vez de esperar
    // 48h por un fallo que no es suyo. Solo se libera en este caso —si la
    // llamada revienta a medias, el email pudo salir igual y el claim se queda
    // puesto (más vale un recordatorio de menos que uno repetido).
    await prisma.cartQuote.update({
      where: { id: cart.id },
      data: {
        reminderSentAt: cart.reminderSentAt,
        reminderCount: { decrement: 1 },
      },
    });
    return NextResponse.json(
      { error: result.error || "Resend no pudo enviar el recordatorio" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    sentTo: cart.email,
    reminderCount: cart.reminderCount + 1,
  });
}
