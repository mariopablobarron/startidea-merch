import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Drip post-pedido: envía hasta 3 emails ciclo de vida tras un pedido entregado.
 *   D0:  Gracias + impacto agregado de SU pedido
 *   D14: Tu memoria RSC con dashboard cliente
 *   D45: Próxima campaña? + cupón 10% personalizado
 *
 * Idempotente — no duplica si EmailDripSent existe para (cartId, step).
 * Llamar diariamente desde cron-job.org.
 */

const STEPS = [0, 14, 45];

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = Date.now();
  const sent = { D0: 0, D14: 0, D45: 0 };
  const errors: string[] = [];

  for (const step of STEPS) {
    const since = new Date(now - (step + 0.99) * 24 * 60 * 60 * 1000);
    const until = new Date(now - step * 24 * 60 * 60 * 1000);

    const candidates = await prisma.cartQuote.findMany({
      where: {
        status: "ORDERED",
        orderedAt: { gte: since, lte: until },
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        items: { select: { quantity: true } },
        customerToken: true,
      },
      take: 50,
    });

    for (const cart of candidates) {
      // Saltarse si ya se envió este step
      const already = await prisma.emailDripSent.findUnique({
        where: { cartId_step: { cartId: cart.id, step } },
      });
      if (already) continue;

      try {
        await sendStep(step, cart);
        await prisma.emailDripSent.create({ data: { cartId: cart.id, step } });
        sent[`D${step}` as keyof typeof sent]++;
      } catch (e) {
        errors.push(`${cart.id} step ${step}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}

async function sendStep(
  step: number,
  cart: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    items: { quantity: number }[];
    customerToken: string | null;
  },
) {
  const firstName = cart.name.split(" ")[0];
  const totalItems = cart.items.reduce((s, it) => s + it.quantity, 0);
  const co2 = Math.round(totalItems * 1.2);

  if (step === 0) {
    await sendEmail({
      to: cart.email,
      subject: `${firstName}, gracias — esto es lo que has generado`,
      context: `post-order-drip step=0 · ${cart.id}`,
      html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Pedido entregado</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Gracias ${firstName}.<br>
            <span style="color:#E63E73;">Esto es lo que has generado.</span>
          </h1>
        </div>
        <div style="padding:0 32px 32px;">
          <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">
            <tr><td style="background:#F4EFE6;padding:20px;border-radius:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Productos producidos</p>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:700;color:#2A2A2A;">${totalItems}</p>
            </td></tr>
            <tr><td style="background:#F4EFE6;padding:20px;border-radius:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">CO₂ ahorrado</p>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:700;color:#E63E73;">${co2} kg</p>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#444;">
            ¿Nos cuentas qué tal ha ido? Te llegará un email con un link rápido para
            valorar — tarda menos de 30 segundos y nos ayuda muchísimo.
          </p>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
    });
    return;
  }

  if (step === 14) {
    const dashUrl = cart.customerToken ? `${SITE_URL}/clientes/${cart.customerToken}` : null;
    await sendEmail({
      to: cart.email,
      subject: `${firstName}, tu informe de impacto está listo para tu memoria`,
      context: `post-order-drip step=14 · ${cart.id}`,
      html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Informe disponible</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName}.<br>
            <span style="color:#a09e98;">Tu informe de impacto está listo.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Han pasado dos semanas desde tu pedido. Tienes el dashboard con datos
            verificables (horas de trabajo digno, % producido en CEE, kg CO₂
            evitados) — listo para incluir en tu memoria de sostenibilidad o
            presentación interna.
          </p>
        </div>
        <div style="padding:0 32px 32px;text-align:center;">
          ${
            dashUrl
              ? `<a href="${dashUrl}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Ver mi dashboard →</a>`
              : `<p style="margin:0;font-size:14px;color:#444;">Responde a este email y te enviamos acceso a tu dashboard privado.</p>`
          }
          <p style="margin:20px 0 0;font-size:12px;color:#6b6b6b;line-height:1.6;">
            ¿Necesitas certificado RSC oficial firmado para reporte GRI o EFRAG?<br>
            Respóndenos y lo emitimos en <strong>48 h</strong>.
          </p>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada</p>
        </div>
      </div>
    </div>`,
    });
    return;
  }

  if (step === 45) {
    // Generamos cupón nominativo 10% válido 30 días
    const code = `${firstName.slice(0, 4).toUpperCase()}10`;
    try {
      await prisma.coupon.upsert({
        where: { code },
        create: {
          code,
          label: `Drip 45d — ${cart.name}`,
          kind: "PERCENT",
          percentValue: 10,
          maxUses: 1,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          active: true,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    } catch {}

    await sendEmail({
      to: cart.email,
      subject: `${firstName}, ¿toca repetir? Tienes 10% sobre tu próxima cotización`,
      context: `post-order-drip step=45 · ${cart.id}`,
      html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Para tu próxima campaña</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName}.<br>
            <span style="color:#E63E73;">10% para tu próxima cotización.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Han pasado 6 semanas desde tu último pedido. Si tienes evento, onboarding
            o cierre de Q a la vista, te dejamos un código personal que reduce un 10%
            sobre tu próxima cotización.
          </p>
        </div>
        <div style="padding:0 32px;">
          <div style="background:#FBDFE9;border:2px dashed #E63E73;padding:24px;text-align:center;border-radius:12px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Tu código personal</p>
            <p style="margin:8px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:700;color:#E63E73;letter-spacing:0.05em;">${code}</p>
            <p style="margin:10px 0 0;font-size:12px;color:#6b6b6b;">Válido 30 días · Solo en tu próximo carrito</p>
          </div>
        </div>
        <div style="padding:24px 32px 32px;text-align:center;">
          <a href="${SITE_URL}/catalogo" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Volver al catálogo →</a>
          <p style="margin:16px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;">
            ¿Quieres que te recomendemos novedades alineadas con tu marca?<br>
            Responde a este email con dos líneas de brief.
          </p>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
    });
    return;
  }
}
