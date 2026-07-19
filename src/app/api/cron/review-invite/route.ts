import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Envía invitaciones de review a clientes con pedido entregado hace ≥7 días
 * que aún no tienen Review creada. Crea Review PENDING con token y dispara
 * email transaccional.
 *
 * Llamar diariamente desde cron-job.org.
 */
export const POST = wrapCronHandler("review-invite", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return withCronLock("review-invite", async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const carts = await prisma.cartQuote.findMany({
    where: {
      status: "ORDERED",
      orderedAt: { lte: sevenDaysAgo, not: null },
      reviews: { none: {} }, // sin review previa
    },
    take: 50,
    select: { id: true, name: true, email: true, company: true },
  });

  // Cerrojo atómico namespaced en EmailDripSent (drips usan 1/3/7/30, followup
  // 102/105/110; 200 = "review invitada"). Review.cartId NO es @unique, así que
  // sin este claim dos ejecuciones solapadas crearían Review + email duplicados.
  // (claim-then-send, bug-bounty 2026-06-17)
  const REVIEW_INVITE_STEP = 200;
  let invited = 0;
  for (const cart of carts) {
    try {
      await prisma.emailDripSent.create({ data: { cartId: cart.id, step: REVIEW_INVITE_STEP } });
    } catch {
      continue; // ya invitado por otra ejecución
    }

    const review = await prisma.review.create({
      data: {
        cartId: cart.id,
        authorName: cart.name,
        authorCompany: cart.company,
      },
    });
    const reviewUrl = `${SITE_URL}/review/${review.token}`;
    const firstName = cart.name.split(" ")[0];

    // sendEmail dispara alerta Telegram automática si Resend falla.
    const result = await sendEmail({
      to: cart.email,
      subject: `${firstName}, ¿qué tal tu pedido con TodoMerchandising?`,
      context: `review-invite · ${review.id}`,
      html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— ¿Qué tal todo?</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName}.<br>
            <span style="color:#E63E73;">¿Cómo lo hemos hecho?</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Hace una semana entregamos tu pedido. Tu opinión nos ayuda a mejorar
            y, sobre todo, anima a otras empresas a producir merchandising con
            impacto social. Es un click + una frase.
          </p>
        </div>
        <div style="padding:0 32px;text-align:center;">
          <a href="${reviewUrl}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Dejar mi opinión →</a>
          <p style="margin:14px 0 0;font-size:12px;color:#6b6b6b;line-height:1.5;">
            Si prefieres que sea privada (solo el equipo la lee), márcalo en el formulario.
            Tardas 30 s.
          </p>
        </div>
        <div style="padding:24px 32px 32px;">
          <div style="padding:16px 18px;background:#F4EFE6;border-radius:12px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">¿Algo no fue perfecto?</p>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#444;">
              Responde a este email y lo arreglamos. Estamos para eso —
              preferimos saberlo nosotros antes de que aparezca en otro sitio.
            </p>
          </div>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
    });
    if (result.ok) invited++;
  }

  return NextResponse.json({ ok: true, invited, candidates: carts.length });
  }) as Promise<NextResponse>;
});
