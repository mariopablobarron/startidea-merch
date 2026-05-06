import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";

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
  if (!resend) return;
  const firstName = cart.name.split(" ")[0];
  const totalItems = cart.items.reduce((s, it) => s + it.quantity, 0);
  const co2 = Math.round(totalItems * 1.2);

  if (step === 0) {
    await resend.emails.send({
      from: RESEND_FROM,
      to: cart.email,
      subject: `${firstName}, gracias — esto es lo que has generado`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
        <h2 style="font-family:Georgia,serif;">Pedido entregado ✓</h2>
        <p>Hola ${firstName},</p>
        <p>Tu pedido ha llegado. Aquí tienes el resumen del impacto que has generado con TodoMerchandising:</p>
        <table style="width:100%;margin:24px 0;border-collapse:collapse;">
          <tr><td style="padding:12px;background:#faf8f4;border-radius:8px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;color:#6b6b6b;">Productos producidos</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:600;">${totalItems}</p>
          </td></tr>
          <tr><td style="padding:12px;background:#faf8f4;border-radius:8px;margin-top:8px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;color:#6b6b6b;">CO₂ ahorrado</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:600;">${co2} kg</p>
          </td></tr>
        </table>
        <p>Cuando tengas un momento, ¿nos cuentas qué tal? Te llegará un email con un link sencillo para valorar.</p>
        <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
      </div>`,
    });
    return;
  }

  if (step === 14) {
    const dashUrl = cart.customerToken ? `${SITE_URL}/clientes/${cart.customerToken}` : null;
    await resend.emails.send({
      from: RESEND_FROM,
      to: cart.email,
      subject: `${firstName}, tu informe de impacto está listo para tu memoria`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
        <h2 style="font-family:Georgia,serif;">Tu informe de impacto</h2>
        <p>Hola ${firstName},</p>
        <p>Han pasado dos semanas desde tu pedido. Tienes tu dashboard de impacto con todos los datos verificables, listo para incluir en tu memoria de sostenibilidad o presentación interna.</p>
        ${
          dashUrl
            ? `<p style="text-align:center;margin:28px 0;"><a href="${dashUrl}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ver mi dashboard →</a></p>`
            : `<p>Si quieres acceso a tu dashboard privado, respóndenos a este email y te lo enviamos.</p>`
        }
        <p style="font-size:13px;color:#6b6b6b;">¿Quieres certificado RSC oficial firmado para reporte GRI/EFRAG? Respóndenos y lo emitimos en 48 h.</p>
        <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
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

    await resend.emails.send({
      from: RESEND_FROM,
      to: cart.email,
      subject: `${firstName}, ¿toca repetir? Tienes 10% sobre tu próxima cotización`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
        <h2 style="font-family:Georgia,serif;">¿Hay próxima campaña en mente?</h2>
        <p>Hola ${firstName},</p>
        <p>Han pasado 6 semanas desde tu último pedido. Si tienes evento, onboarding o cierre de Q a la vista, te dejamos un código personal que reduce un 10% tu próxima cotización:</p>
        <div style="background:#fff3ed;border:2px dashed #ff6b35;padding:20px;text-align:center;border-radius:12px;margin:24px 0;">
          <p style="margin:0;font-family:monospace;font-size:24px;font-weight:700;color:#c43c0d;">${code}</p>
          <p style="margin:8px 0 0;font-size:11px;color:#6b6b6b;">Válido 30 días · Solo en tu próximo carrito</p>
        </div>
        <p style="text-align:center;">
          <a href="${SITE_URL}/catalogo" style="background:#0a0a0b;color:white;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Volver al catálogo →</a>
        </p>
        <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
      </div>`,
    });
    return;
  }
}
