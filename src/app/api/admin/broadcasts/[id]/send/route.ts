import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { resend, MARKETING_FROM, sendEmail } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";
import { resolveAudience } from "@/lib/broadcast-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min para audiencias grandes

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const TestSchema = z.object({
  testEmail: z.string().email(),
});

/**
 * POST /api/admin/broadcasts/[id]/send
 *
 * Envía el broadcast:
 *   - Sin body  → envía a TODA la audiencia (status DRAFT/SCHEDULED → SENT)
 *   - { testEmail: "..." } → envía SOLO a ese email (no cambia status)
 *
 * Estrategia anti-rate-limit: enviamos en lotes de 10 con throttle de 100ms
 * entre cada envío individual. Resend permite 10 req/s en tier free.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!resend) {
    return NextResponse.json({ error: "Resend no configurado" }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const isTest = body && typeof body.testEmail === "string";

  const broadcast = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!broadcast) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // ── Caso TEST: envía a un solo email ─────────────────────────
  if (isTest) {
    const parsed = TestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

    // sendEmail dispara alerta Telegram automática si Resend falla.
    const result = await sendEmail({
      to: parsed.data.testEmail,
      from: MARKETING_FROM,
      subject: `[TEST] ${broadcast.subject}`,
      html: applyFooter(
        broadcast.html,
        `${SITE_URL}/api/newsletter/unsubscribe?token=test`,
        broadcast.preheader,
      ),
      context: `broadcast test · ${broadcast.id}`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: parsed.data.testEmail, test: true });
  }

  // ── Caso REAL: envía a la audiencia ──────────────────────────
  if (broadcast.status === "SENT" || broadcast.status === "SENDING") {
    return NextResponse.json(
      { error: `Broadcast ya está en estado ${broadcast.status}` },
      { status: 409 },
    );
  }

  await prisma.emailBroadcast.update({
    where: { id },
    data: { status: "SENDING" },
  });

  const recipients = await resolveAudience(broadcast.audience, broadcast.audienceTags);

  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    try {
      const unsubscribeUrl = r.unsubscribeToken
        ? `${SITE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}`
        : `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(r.email)}`;
      await resend.emails.send({
        from: MARKETING_FROM,
        to: r.email,
        subject: broadcast.subject,
        html: applyFooter(personalize(broadcast.html, r.name || ""), unsubscribeUrl, broadcast.preheader),
        text: broadcast.text || stripHtml(broadcast.html),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      });
      await prisma.broadcastDelivery
        .create({
          data: { broadcastId: id, email: r.email, status: "SENT" },
        })
        .catch(() => {});
      sentCount++;
    } catch (e) {
      await prisma.broadcastDelivery
        .create({
          data: {
            broadcastId: id,
            email: r.email,
            status: "FAILED",
            error: e instanceof Error ? e.message.slice(0, 500) : "error",
          },
        })
        .catch(() => {});
      failedCount++;
    }
    // Throttle 100ms para no pasar el rate-limit de Resend
    await new Promise((res) => setTimeout(res, 100));
  }

  // Update NewsletterSubscriber.lastSentAt + totalSent para audiencias newsletter
  if (broadcast.audience === "NEWSLETTER_ALL" || broadcast.audience === "NEWSLETTER_NEW") {
    await prisma.newsletterSubscriber
      .updateMany({
        where: { email: { in: recipients.map((r) => r.email) } },
        data: { lastSentAt: new Date(), totalSent: { increment: 1 } },
      })
      .catch(() => {});
  }

  await prisma.emailBroadcast.update({
    where: { id },
    data: {
      status: failedCount === recipients.length && recipients.length > 0 ? "FAILED" : "SENT",
      sentAt: new Date(),
      sentCount,
      failedCount,
    },
  });

  // Alerta Telegram si tasa de fallo > 50% (indica problema sistémico:
  // quota Resend, dominio caído, etc.). Sin spam por cada fallo individual
  // ya que el delivery por email queda registrado en BroadcastDelivery.
  if (recipients.length > 0 && failedCount / recipients.length > 0.5) {
    void notifyTelegram(
      `⚠️ <b>Broadcast con ${failedCount}/${recipients.length} fallos (${Math.round(
        (failedCount / recipients.length) * 100,
      )}%)</b>\n` +
        `Asunto: ${broadcast.subject.slice(0, 100)}\n` +
        `Broadcast ID: <code>${id}</code>\n` +
        `Audiencia: ${broadcast.audience}\n\n` +
        `Revisa /admin/marketing/broadcasts/${id} y los deliveries en BD.`,
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    audienceSize: recipients.length,
    sentCount,
    failedCount,
  });
}

function personalize(html: string, name: string): string {
  const firstName = name.split(" ")[0] || "";
  return html.replace(/\{\{name\}\}/g, name).replace(/\{\{firstName\}\}/g, firstName);
}

/**
 * Envuelve el contenido del broadcast en el template Startidea
 * (crema, card blanca, footer oscuro con marca y baja).
 *
 * Si el HTML ya viene como documento completo (`<!doctype` o `<html>`),
 * sólo asegura la baja legal — Mario puede mandar HTML totalmente custom
 * cuando lo necesite.
 */
function applyFooter(html: string, unsubscribeUrl: string, preheader?: string | null): string {
  const trimmed = html.trim();
  const isFullDoc = /^<!doctype/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);

  if (isFullDoc) {
    // Si ya es doc completo, sólo añadimos baja si falta
    if (trimmed.includes("unsubscribe") || trimmed.includes("List-Unsubscribe")) return html;
    const footer = `
<p style="color:#888;font-size:11px;font-family:sans-serif;text-align:center;margin:24px 0;">
  STARTIDEA MALAGA SL · CIF B19583632 · Granada<br>
  <a href="${unsubscribeUrl}" style="color:#888;">Darme de baja</a>
</p>`;
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }

  // Wrap completo con brand Startidea
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader.replace(/[<>&]/g, "")}</div>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>todomerchandising</title>
</head>
<body style="margin:0;padding:0;background:#F4EFE6;font-family:Helvetica,Arial,sans-serif;color:#2A2A2A;">
${preheaderHtml}
<div style="background:#F4EFE6;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <div style="padding:32px 32px 8px;">
${html}
    </div>
    <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
      <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
      <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
      <p style="margin:6px 0 0;"><a href="${unsubscribeUrl}" style="color:rgba(244,239,230,0.7);text-decoration:underline;">Darme de baja</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, "")
    .replace(/<script[^>]*>.*?<\/script>/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
