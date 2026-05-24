import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const MIN_HOURS = 24; // espera 24h antes del primer recordatorio (no agobiar)
const COOLDOWN_HOURS = 96; // 4 días entre recordatorios
const MAX_REMINDERS = 2; // tras 2 envíos sin acción, paramos
const BATCH_LIMIT = 30; // máximo por ejecución (evita rate-limit Resend)

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Cron de recordatorios automáticos de carritos abandonados.
 *
 * Cron del VPS lo ejecuta cada 12h. Selecciona hasta BATCH_LIMIT carritos:
 *  - status NEW o IN_PROGRESS
 *  - createdAt > MIN_HOURS
 *  - reminderCount < MAX_REMINDERS
 *  - reminderSentAt NULL o > COOLDOWN_HOURS atrás
 *  - tienen al menos 1 item
 *  - email válido
 *
 * Por cada uno: envía email + actualiza reminderSentAt/reminderCount.
 * Si Resend falla en uno, sigue con los demás.
 *
 * Telegram notifica resumen al terminar.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const minAge = new Date(Date.now() - MIN_HOURS * 60 * 60 * 1000);
  const cooldown = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);

  const carts = await prisma.cartQuote.findMany({
    where: {
      status: { in: ["NEW", "IN_PROGRESS"] },
      email: { not: "" },
      createdAt: { lt: minAge },
      reminderCount: { lt: MAX_REMINDERS },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: cooldown } }],
      items: { some: {} },
    },
    orderBy: [{ reminderSentAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: BATCH_LIMIT,
    select: {
      id: true,
      name: true,
      email: true,
      reminderCount: true,
      estimatedTotalCents: true,
      items: {
        select: { quantity: true, productName: true, totalClientCents: true },
        take: 6,
      },
    },
  });

  if (carts.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Sin carritos abandonados pendientes" });
  }

  if (!resend) {
    return NextResponse.json({ error: "Resend no configurado" }, { status: 503 });
  }

  // Cargar promos activas una vez para toda la tanda. Si hay alguna con
  // scope=ALL la usamos como gancho universal en cada email. Otras scopes
  // (categoría/producto) requerirían cruzar con los items, lo cual encarece
  // el cron — se queda para una iteración posterior si hace falta.
  const activePromos = await loadActivePromotions();
  const universalPromo = activePromos.find(
    (p) => p.scope === "ALL" && p.displayInList,
  );
  const universalPromoBlock = universalPromo
    ? `
  <div style="margin-top:24px;padding:16px;border:1px solid ${
    universalPromo.badgeColor || "#E63E73"
  }33;background:${universalPromo.badgeColor || "#E63E73"}10;border-radius:12px;">
    <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Promoción activa</p>
    <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#2A2A2A;">
      <span style="display:inline-block;background:${universalPromo.badgeColor || "#E63E73"};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;margin-right:8px;">${getBadgeText(universalPromo)}</span>
      ${universalPromo.name}
    </p>
    ${universalPromo.endsAt ? `<p style="margin:8px 0 0;font-size:13px;color:#666;">Válida hasta el ${new Date(universalPromo.endsAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}. Se aplica automáticamente al retomar tu cotización.</p>` : ""}
  </div>`
    : "";

  let sent = 0;
  let failed = 0;
  const errors: Array<{ cartId: string; error: string }> = [];

  for (const cart of carts) {
    try {
      const firstName = cart.name.split(" ")[0] || "";
      const recoverUrl = `${SITE_URL}/cotizar?recover=${cart.id}`;
      const isSecondReminder = cart.reminderCount >= 1;

      const itemsHtml = cart.items
        .map(
          (it) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${it.quantity}× ${it.productName}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">${it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : ""}</td></tr>`,
        )
        .join("");
      const totalLine = cart.estimatedTotalCents
        ? `<p style="margin-top:16px;font-size:16px;"><strong>Total estimado: ${EUR.format(cart.estimatedTotalCents / 100)}</strong></p>`
        : "";

      const subject = isSecondReminder
        ? `${firstName ? firstName + ", ú" : "Ú"}ltima oportunidad para retomar tu cotización`
        : `${firstName ? firstName + ", t" : "T"}u cotización en TodoMerchandising te espera`;

      const intro = isSecondReminder
        ? `Llevamos unos días sin saber de ti y queremos asegurarnos de que esta cotización no se te pasa. Si ya no te interesa, te puedes olvidar de este email sin más.`
        : `Te dejaste algunos productos en tu cotización y no queremos que se te pasen. Esto es lo que tenías:`;

      await resend.emails.send({
        from: RESEND_FROM,
        to: cart.email,
        subject,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;color:#2A2A2A;line-height:1.5;">
  <h2 style="font-family:Georgia,serif;font-size:26px;color:#2A2A2A;margin:0 0 8px;">Hola ${firstName || cart.name},</h2>
  <p style="font-size:16px;color:#444;">${intro}</p>
  <table style="width:100%;margin-top:20px;font-size:14px;">${itemsHtml}</table>
  ${totalLine}
  ${universalPromoBlock}
  <p style="margin-top:24px;">Podemos cerrarte la cotización con tarifas finales en <strong>menos de 24h</strong>. Solo necesitamos confirmar cantidades y marcaje.</p>
  <div style="margin:32px 0;">
    <a href="${recoverUrl}" style="display:inline-block;background:#E63E73;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">Retomar mi cotización →</a>
  </div>
  <p style="color:#888;font-size:13px;">¿Prefieres que te llamemos? Responde a este email o llámanos al +34 958 045 789.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="color:#888;font-size:12px;margin:0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada</p>
</div>`,
      });

      await prisma.cartQuote.update({
        where: { id: cart.id },
        data: {
          reminderSentAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });
      sent++;
    } catch (err) {
      failed++;
      errors.push({
        cartId: cart.id,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    errors: errors.slice(0, 5),
  });
}
