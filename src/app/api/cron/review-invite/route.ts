import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";

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
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

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

  let invited = 0;
  for (const cart of carts) {
    const review = await prisma.review.create({
      data: {
        cartId: cart.id,
        authorName: cart.name,
        authorCompany: cart.company,
      },
    });
    const reviewUrl = `${SITE_URL}/review/${review.token}`;

    if (resend) {
      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to: cart.email,
          subject: `${cart.name.split(" ")[0]}, ¿qué tal tu pedido con TodoMerchandising?`,
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
              <h2 style="font-family:Georgia,serif;">¿Cómo lo hemos hecho?</h2>
              <p>Hola ${cart.name.split(" ")[0]},</p>
              <p>Hace una semana entregamos tu pedido. Si tienes 30 segundos, tu opinión nos ayuda a mejorar y a que otras empresas se animen a producir merchandising con impacto social.</p>
              <p style="text-align:center;margin:32px 0;">
                <a href="${reviewUrl}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Dejar mi opinión →</a>
              </p>
              <p style="font-size:13px;color:#6b6b6b;">Es un click + 1 frase. Si quieres, puedes pedir que sea privada (solo la verá el equipo).</p>
              <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
            </div>`,
        });
        invited++;
      } catch (err) {
        console.error("[review-invite]", err);
      }
    } else {
      invited++;
    }
  }

  return NextResponse.json({ ok: true, invited, candidates: carts.length });
}
