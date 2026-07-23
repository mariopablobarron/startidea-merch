import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
const DAY = 24 * 60 * 60 * 1000;

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Seguimiento de cotizaciones con ENLACE DE PAGO enviado pero SIN pagar.
 *
 * Distinto del drip de carrito abandonado (ese trabaja NEW/IN_PROGRESS).
 * Aquí el cliente ya recibió un enlace de pago (status=SENT) y no ha pagado:
 * es dinero en movimiento que hoy nadie persigue.
 *
 *   D2:  recordatorio amable con el enlace
 *   D5:  ofrece ayuda / resolver dudas
 *   D10: último aviso antes de cerrar la cotización
 *
 * Steps namespaced 102/105/110 en EmailDripSent para no colisionar con el
 * abandoned-cart-drip (1/3/7/30). Envía como MUCHO 1 email por cotización y
 * ejecución (el escalón más alto pendiente) → no bombardea el backlog antiguo.
 *
 * Llamar 1x/día:  POST /api/cron/quote-followup  (Header X-Cron-Secret)
 */
type Step = { code: number; days: number };
const STEPS: Step[] = [
  { code: 102, days: 2 },
  { code: 105, days: 5 },
  { code: 110, days: 10 },
];

export const POST = wrapCronHandler("quote-followup", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return withCronLock("quote-followup", async () => {
  const now = Date.now();
  const sent = { d2: 0, d5: 0, d10: 0 };
  const errors: string[] = [];

  const carts = await prisma.cartQuote.findMany({
    where: {
      status: "SENT",
      paymentLinkToken: { not: null },
      paymentLinkSentAt: { not: null },
      payments: { none: { status: "PAID" } },
      // No perseguir enlaces ya caducados (sin caducidad = se sigue persiguiendo).
      OR: [{ paymentLinkExpiresAt: null }, { paymentLinkExpiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      paymentLinkToken: true,
      paymentLinkSentAt: true,
      acceptedTotalCents: true,
      depositPercent: true,
    },
    take: 300,
  });

  for (const cart of carts) {
    if (!cart.email || !cart.paymentLinkToken || !cart.paymentLinkSentAt) continue;
    const ageDays = (now - cart.paymentLinkSentAt.getTime()) / DAY;
    // Escalón más alto cuyo umbral ya se cumple.
    const due = [...STEPS].reverse().find((s) => ageDays >= s.days);
    if (!due) continue;

    if (!resend) {
      errors.push(`cart ${cart.id}: Resend no configurado`);
      break;
    }

    // Claim atómico ANTES de enviar: el create reclama (cart, step); si ya estaba
    // reclamado lanza P2002 → saltamos. Evita duplicar el email bajo solape o si
    // un run muere a mitad. (claim-then-send, bug-bounty 2026-06-17)
    try {
      await prisma.emailDripSent.create({ data: { cartId: cart.id, step: due.code } });
    } catch {
      continue; // ya reclamado
    }

    try {
      await sendFollowup(cart, due);
      if (due.code === 102) sent.d2++;
      else if (due.code === 105) sent.d5++;
      else sent.d10++;
    } catch (e) {
      errors.push(`cart ${cart.id} step ${due.code}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
  }) as Promise<NextResponse>;
});

async function sendFollowup(
  cart: {
    id: string;
    name: string;
    email: string;
    paymentLinkToken: string | null;
    acceptedTotalCents: number | null;
    depositPercent: number | null;
  },
  step: Step,
) {
  const firstName = cart.name.split(" ")[0] || "";
  const payUrl = `${SITE_URL}/pay/${cart.paymentLinkToken}`;
  const depositCents =
    cart.acceptedTotalCents != null
      ? Math.round((cart.acceptedTotalCents * (cart.depositPercent ?? 100)) / 100)
      : null;
  const amountLine = depositCents
    ? `<p style="margin-top:14px;font-size:17px;color:#0a0a0b;"><strong>Importe a pagar: ${EUR.format(depositCents / 100)}</strong>${cart.depositPercent && cart.depositPercent < 100 ? ` (depósito ${cart.depositPercent}%)` : ""}</p>`
    : "";

  let subject: string;
  let lead: string;
  let extraBlock = "";
  let ctaLabel = "Completar el pago →";

  if (step.code === 102) {
    subject = `${firstName ? firstName + ", t" : "T"}u pedido está a un paso`;
    lead =
      "Te preparamos el enlace de pago para confirmar tu pedido y reservar producción. Lo dejamos a mano por si se te traspapeló:";
  } else if (step.code === 105) {
    subject = `${firstName ? firstName + ", " : ""}¿te ayudamos a cerrar tu pedido?`;
    lead =
      "Vimos que aún no has confirmado el pago de tu pedido. Si tienes dudas con cantidades, plazos o el marcaje, respóndenos a este email y lo resolvemos en minutos.";
    extraBlock = `
      <p style="margin:20px 0;padding:14px;background:#f1ede5;border-radius:8px;font-size:14px;color:#444;">
        💬 <strong>¿Alguna duda antes de pagar?</strong> Responde a este email y un asesor te atiende personalmente.
      </p>`;
  } else {
    subject = `${firstName ? firstName + ", " : ""}último aviso sobre tu pedido pendiente`;
    lead =
      "Es la última vez que te escribimos sobre este pedido. Si quieres seguir adelante, el enlace sigue activo; si no, no te preocupes, lo cerramos por ti.";
    ctaLabel = "Confirmar y pagar →";
  }

  await resend!.emails.send({
    from: RESEND_FROM,
    to: cart.email,
    subject,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;line-height:1.5;">
  <h2 style="font-family:Georgia,serif;font-size:24px;color:#0a0a0b;margin:0 0 8px;">Hola ${firstName || cart.name},</h2>
  <p style="font-size:15px;color:#444;">${lead}</p>
  ${amountLine}
  ${extraBlock}
  <div style="margin:28px 0;">
    <a href="${payUrl}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:15px;">${ctaLabel}</a>
  </div>
  <p style="color:#888;font-size:12px;">Pago seguro con Stripe. Si prefieres no recibir más avisos sobre este pedido, responde "BAJA".</p>
  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
  <p style="color:#888;font-size:11px;margin:0;">
    STARTIDEA MALAGA SL · CIF B19583632 · Granada<br>
    Email automático · seguimiento de cotización
  </p>
</div>`,
    text: `Hola ${firstName || cart.name},\n\n${lead}\n\n${depositCents ? `Importe a pagar: ${EUR.format(depositCents / 100)}\n\n` : ""}Completar el pago: ${payUrl}\n\nSTARTIDEA MALAGA SL`,
  });
}
