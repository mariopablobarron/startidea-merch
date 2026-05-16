import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { resend, RESEND_FROM, sendEmail } from "@/lib/resend";
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
      subject: `[TEST] ${broadcast.subject}`,
      html: applyFooter(broadcast.html, `${SITE_URL}/api/newsletter/unsubscribe?token=test`),
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

  const recipients = await resolveAudience(broadcast.audience);

  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    try {
      const unsubscribeUrl = r.unsubscribeToken
        ? `${SITE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}`
        : `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(r.email)}`;
      await resend.emails.send({
        from: RESEND_FROM,
        to: r.email,
        subject: broadcast.subject,
        html: applyFooter(personalize(broadcast.html, r.name || ""), unsubscribeUrl),
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

function applyFooter(html: string, unsubscribeUrl: string): string {
  // Solo añadir footer si el HTML no lo trae ya
  if (html.includes("unsubscribe") || html.includes("List-Unsubscribe")) return html;
  const footer = `
<hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
<p style="color:#888;font-size:11px;font-family:sans-serif;text-align:center;margin:0;">
  STARTIDEA MALAGA SL · CIF B19583632 · Málaga, España<br>
  <a href="${unsubscribeUrl}" style="color:#888;">Darme de baja</a>
</p>`;
  return html + footer;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, "")
    .replace(/<script[^>]*>.*?<\/script>/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
