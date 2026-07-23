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

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Drip de carritos abandonados — 3 emails automáticos + auto-archivo.
 *
 *   D1  (24h):   recordatorio amistoso "te quedó esto"
 *   D3  (72h):   urgencia suave "todavía aquí" + posible asistencia humana
 *   D7  (168h):  último intento con incentivo (-10% sobre estimado)
 *   D30 (720h):  ARCHIVAR — no se envía email, se marca status=ARCHIVED
 *
 * Idempotente: usa EmailDripSent.step ∈ {1,3,7,30} para no duplicar.
 * Step 30 NO envía email — solo archiva.
 *
 * Solo procesa carritos:
 *   - status ∈ {NEW, IN_PROGRESS}
 *   - email no vacío
 *   - tiene al menos 1 item
 *   - no tiene ningún Payment.PAID asociado
 *
 * Llamar 1x/día desde el crontab del VPS (05:30, vía merch-cron-runner.sh):
 *   POST /api/cron/abandoned-cart-drip  con header X-Cron-Secret
 * Es el ÚNICO sistema de recordatorio de carritos (el antiguo abandoned-reminders
 * se consolidó aquí en 2026-07: este drip cubre todo lo que hacía y más).
 */

type DripStep = 1 | 3 | 7 | 30;

const STEPS: DripStep[] = [1, 3, 7, 30];

export const POST = wrapCronHandler("abandoned-cart-drip", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return withCronLock("abandoned-cart-drip", async () => {
  const sent = { d1: 0, d3: 0, d7: 0, archived: 0 };
  const errors: string[] = [];
  const now = Date.now();

  for (const step of STEPS) {
    const ageMs = step * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now - ageMs);

    const candidates = await prisma.cartQuote.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        email: { not: "" },
        createdAt: { lte: cutoff },
        items: { some: {} },
        // No procesar si ya pagado (Payment con status PAID)
        payments: { none: { status: "PAID" } },
        // No procesar si ya hay drip de este step (idempotencia)
        // (filtro adicional con SQL crudo no posible vía Prisma where, lo
        // hacemos con NOT IN via subquery: usamos EmailDripSent unique).
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        estimatedTotalCents: true,
        items: {
          select: { quantity: true, productName: true, totalClientCents: true },
          take: 6,
        },
      },
      take: 200,
    });

    for (const cart of candidates) {
      // step 30 solo archiva (sin email); el resto necesita resend para enviar.
      if (step !== 30 && !resend) {
        errors.push(`cart ${cart.id} step ${step}: Resend no configurado`);
        continue;
      }

      // Claim atómico ANTES de cualquier efecto externo: el create de EmailDripSent
      // reclama (cart, step); si otra ejecución ya lo hizo, lanza P2002 → saltamos.
      // Evita duplicar emails aunque dos ejecuciones se solapen o un run muera a
      // mitad. Si el envío falla luego, el claim queda puesto (no se reintenta):
      // preferimos perder un recordatorio antes que spamear. (claim-then-send,
      // bug-bounty 2026-06-17)
      try {
        await prisma.emailDripSent.create({ data: { cartId: cart.id, step } });
      } catch {
        continue; // ya reclamado por otra ejecución / día anterior
      }

      try {
        if (step === 30) {
          // Auto-archivar — sin email
          await prisma.cartQuote.update({
            where: { id: cart.id },
            data: { status: "ARCHIVED" },
          });
          sent.archived++;
        } else {
          await sendStep(cart, step);
          await prisma.cartQuote.update({
            where: { id: cart.id },
            data: {
              reminderSentAt: new Date(),
              reminderCount: { increment: 1 },
            },
          });
          if (step === 1) sent.d1++;
          else if (step === 3) sent.d3++;
          else if (step === 7) sent.d7++;
        }
      } catch (e) {
        errors.push(`cart ${cart.id} step ${step}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
  }) as Promise<NextResponse>;
});

async function sendStep(
  cart: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    estimatedTotalCents: number | null;
    items: Array<{ quantity: number; productName: string; totalClientCents: number | null }>;
  },
  step: DripStep,
) {
  const firstName = cart.name.split(" ")[0] || "";
  const recoverUrl = `${SITE_URL}/cotizar?recover=${cart.id}`;
  const itemsHtml = cart.items
    .map(
      (it) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;">${it.quantity}× ${it.productName}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;color:#888;font-size:13px;">${
          it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : ""
        }</td>
      </tr>`,
    )
    .join("");

  const totalLine = cart.estimatedTotalCents
    ? `<p style="margin-top:14px;font-size:17px;color:#0a0a0b;"><strong>Total estimado: ${EUR.format(cart.estimatedTotalCents / 100)}</strong></p>`
    : "";

  let subject: string;
  let lead: string;
  let extraBlock = "";
  let ctaLabel = "Retomar mi cotización →";

  if (step === 1) {
    subject = `${firstName ? firstName + ", t" : "T"}u cotización en TodoMerchandising te espera`;
    lead = "Te dejaste algunos productos en tu cotización ayer y no queremos que se te pasen.";
  } else if (step === 3) {
    subject = `${firstName ? firstName + ", " : ""}¿quieres que te ayudemos a cerrar la cotización?`;
    lead = "Llevamos unos días con tu cotización a medias. Si tienes dudas con cantidades, técnica de marcaje o plazos, podemos llamarte y resolverlo en 10 min.";
    extraBlock = `
      <p style="margin:20px 0;padding:14px;background:#f1ede5;border-radius:8px;font-size:14px;color:#444;">
        💬 <strong>¿Necesitas ayuda?</strong> Responde a este email o escríbenos por WhatsApp y un asesor humano te marca en 1h laboral.
      </p>`;
  } else {
    // step === 7
    subject = `${firstName ? firstName + ", " : ""}última oportunidad — descuento por confirmar esta semana`;
    lead = "Esta es la última vez que te escribimos sobre tu cotización pendiente. Si quieres cerrarla, te aplicamos un -10% por las molestias de la espera.";
    const discounted = cart.estimatedTotalCents
      ? EUR.format((cart.estimatedTotalCents * 0.9) / 100)
      : null;
    extraBlock = `
      <div style="margin:20px 0;padding:18px;background:linear-gradient(135deg,#ff6b35 0%,#ff8a5b 100%);color:#fff;border-radius:12px;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">Descuento exclusivo</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:600;">-10%</p>
        ${discounted ? `<p style="margin:6px 0 0;font-size:15px;opacity:.9;">Total con descuento: <strong>${discounted}</strong></p>` : ""}
        <p style="margin:8px 0 0;font-size:11px;opacity:.85;">Válido si confirmas esta semana. Aplica al pulsar el botón abajo.</p>
      </div>`;
    ctaLabel = "Quiero el -10% →";
  }

  await resend!.emails.send({
    from: RESEND_FROM,
    to: cart.email,
    subject,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;line-height:1.5;">
  <h2 style="font-family:Georgia,serif;font-size:24px;color:#0a0a0b;margin:0 0 8px;">Hola ${firstName || cart.name},</h2>
  <p style="font-size:15px;color:#444;">${lead}</p>

  <table style="width:100%;margin-top:16px;">
    ${itemsHtml}
  </table>
  ${totalLine}
  ${extraBlock}

  <div style="margin:28px 0;">
    <a href="${recoverUrl}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:15px;">${ctaLabel}</a>
  </div>

  <p style="color:#888;font-size:12px;">¿Prefieres que dejemos de enviarte estos avisos? Responde "BAJA" a este email.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
  <p style="color:#888;font-size:11px;margin:0;">
    STARTIDEA MALAGA SL · CIF B19583632 · Málaga, España<br>
    Email automático · drip ${step}
  </p>
</div>`,
    text: `Hola ${firstName || cart.name},\n\n${lead}\n\nProductos:\n${cart.items.map((it) => `- ${it.quantity}× ${it.productName}`).join("\n")}\n\nRetomar: ${recoverUrl}\n\nSTARTIDEA MALAGA SL`,
  });
}
