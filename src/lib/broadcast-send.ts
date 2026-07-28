import { prisma } from "@/lib/prisma";
import { resend, MARKETING_FROM, MARKETING_REPLY_TO } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";
import { resolveAudience } from "@/lib/broadcast-audience";
import { emailShell } from "@/lib/email-templates";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

// Estados desde los que se puede lanzar un envío (no SENDING/SENT).
const SENDABLE = ["DRAFT", "SCHEDULED", "FAILED", "CANCELED"] as const;

export type SendBroadcastResult =
  | { ok: true; audienceSize: number; sentCount: number; failedCount: number }
  | { ok: false; error: string; status?: number };

/**
 * Envía un broadcast a TODA su audiencia. Usado por el botón "Enviar ahora"
 * y por el cron de programados. Bloqueo atómico (DRAFT/… → SENDING vía
 * updateMany condicional) para que cron y envío manual no disparen dos veces.
 *
 * Throttle de 100ms/email (~10/s, límite free de Resend). Registra cada
 * BroadcastDelivery con su resendId para mapear aperturas/clics del webhook.
 */
export async function sendBroadcast(id: string): Promise<SendBroadcastResult> {
  if (!resend) return { ok: false, error: "Resend no configurado", status: 503 };

  const broadcast = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!broadcast) return { ok: false, error: "No encontrado", status: 404 };
  if (broadcast.status === "SENT" || broadcast.status === "SENDING") {
    return { ok: false, error: `Broadcast ya está en estado ${broadcast.status}`, status: 409 };
  }

  // Bloqueo atómico: solo un proceso consigue pasar de SENDABLE → SENDING.
  const lock = await prisma.emailBroadcast.updateMany({
    where: { id, status: { in: [...SENDABLE] } },
    data: { status: "SENDING" },
  });
  if (lock.count === 0) {
    return { ok: false, error: "El broadcast ya está siendo enviado", status: 409 };
  }

  const audience = await resolveAudience(
    broadcast.audience,
    broadcast.audienceTags,
    broadcast.audienceSource,
  );

  // Filtrar la lista de supresión global (rebotes/quejas/opt-out). El webhook
  // de Resend alimenta OutboundSuppression con cada email.bounced/complained;
  // los broadcasts deben respetarla igual que el cold-email (prospect-queue),
  // o reenviaríamos a direcciones que ya rebotaron o se quejaron — daña la
  // reputación del dominio e incumple la baja. (bug-bounty 2026-06-17)
  const suppressed = new Set(
    (await prisma.outboundSuppression.findMany({ select: { email: true } })).map((s) =>
      s.email.toLowerCase(),
    ),
  );
  const recipients = audience.filter((r) => !suppressed.has(r.email.toLowerCase()));

  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    try {
      const unsubscribeUrl = r.unsubscribeToken
        ? `${SITE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}`
        : `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(r.email)}`;
      const sendRes = await resend.emails.send({
        from: MARKETING_FROM,
        replyTo: MARKETING_REPLY_TO,
        to: r.email,
        subject: broadcast.subject,
        html: applyFooter(personalize(broadcast.html, r.name || ""), unsubscribeUrl, broadcast.preheader),
        text: broadcast.text || stripHtml(broadcast.html),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      });
      const resendId = sendRes && "data" in sendRes && sendRes.data ? sendRes.data.id : null;
      await prisma.broadcastDelivery
        .create({ data: { broadcastId: id, email: r.email, status: "SENT", resendId } })
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
    await new Promise((res) => setTimeout(res, 100));
  }

  // Marca lastSentAt + totalSent para cualquier audiencia de newsletter.
  if (broadcast.audience.startsWith("NEWSLETTER")) {
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

  return { ok: true, audienceSize: recipients.length, sentCount, failedCount };
}

export function personalize(html: string, name: string): string {
  const firstName = name.split(" ")[0] || "";
  return html.replace(/\{\{name\}\}/g, name).replace(/\{\{firstName\}\}/g, firstName);
}

/**
 * Envuelve el contenido del broadcast en el template Startidea
 * (crema, card blanca, footer oscuro con marca y baja).
 *
 * Si el HTML ya viene como documento completo (`<!doctype` o `<html>`),
 * sólo asegura la baja legal — Mario puede mandar HTML totalmente custom.
 */
export function applyFooter(html: string, unsubscribeUrl: string, preheader?: string | null): string {
  const trimmed = html.trim();
  const isFullDoc = /^<!doctype/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);

  if (isFullDoc) {
    if (trimmed.includes("unsubscribe") || trimmed.includes("List-Unsubscribe")) return html;
    const footer = `
<p style="color:#888;font-size:11px;font-family:sans-serif;text-align:center;margin:24px 0;">
  STARTIDEA MALAGA SL · CIF B19583632 · Granada<br>
  <a href="${unsubscribeUrl}" style="color:#888;">Darme de baja</a>
</p>`;
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }

  // Shell ÚNICO de marca: delegamos en el central (email-templates.ts) con
  // soporte de baja — misma fuente de verdad que el resto de emails.
  return emailShell(
    `<tr><td style="padding:32px 40px 8px;font-size:15px;line-height:1.6;color:#2A2A2A">
${html}
    </td></tr>`,
    preheader ?? "",
    { unsubscribeUrl },
  );
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, "")
    .replace(/<script[^>]*>.*?<\/script>/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
