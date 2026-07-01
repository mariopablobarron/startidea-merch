import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppressEmail } from "@/lib/outbound-email";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

/**
 * Webhook de Resend — cura la lista automáticamente.
 *
 * Ante un REBOTE duro (email.bounced) o una QUEJA de spam (email.complained),
 * añade el email a la lista de supresión y marca de baja al suscriptor. Así la
 * base se limpia sola mientras se envía → protege la entregabilidad.
 *
 * Seguridad: verifica la firma Svix con RESEND_WEBHOOK_SECRET.
 */
function verifySvix(secret: string, body: string, headers: Headers): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  try {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64");
    const expBuf = Buffer.from(expected);
    // El header es "v1,<sig> v1,<sig2> ..."
    return sigHeader.split(" ").some((part) => {
      const sig = part.includes(",") ? part.split(",")[1] : part;
      const sBuf = Buffer.from(sig);
      return sBuf.length === expBuf.length && timingSafeEqual(sBuf, expBuf);
    });
  } catch {
    return false;
  }
}

function extractEmails(data: unknown): string[] {
  const d = data as { to?: unknown; email?: unknown };
  const out: string[] = [];
  if (Array.isArray(d?.to)) out.push(...d.to.map(String));
  else if (typeof d?.to === "string") out.push(d.to);
  if (typeof d?.email === "string") out.push(d.email);
  return out.map((e) => e.toLowerCase().trim()).filter((e) => e.includes("@"));
}

export async function POST(req: Request) {
  const body = await req.text();

  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET no configurado" }, { status: 503 });
  }
  if (!verifySvix(WEBHOOK_SECRET, body, req.headers)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const type = event.type || "";
  // Solo rebotes duros y quejas limpian la lista (un soft-bounce no).
  if (type === "email.bounced" || type === "email.complained") {
    const emails = extractEmails(event.data);
    const reason = type === "email.complained" ? "complaint" : "bounce";
    for (const email of emails) {
      await suppressEmail(email, reason);
      await prisma.newsletterSubscriber
        .updateMany({
          where: { email, unsubscribedAt: null },
          data: { unsubscribedAt: new Date() },
        })
        .catch(() => {});
    }
    if (emails.length > 0) {
      void notifyTelegram(
        `🧹 <b>Lista curada</b> (${reason})\n${emails.length} email(s) a supresión: ${emails.join(", ").slice(0, 200)}`,
      ).catch(() => {});
    }
  }

  // APERTURA → estadística + lead scoring.
  if (type === "email.opened") {
    const d = event.data as { email_id?: string };
    const now = new Date();
    if (d?.email_id) {
      // Primera apertura: fija openedAt solo si estaba vacío.
      await prisma.broadcastDelivery
        .updateMany({
          where: { resendId: d.email_id, openedAt: null },
          data: { openedAt: now },
        })
        .catch(() => {});
      // Cada apertura: incrementa el contador.
      await prisma.broadcastDelivery
        .updateMany({ where: { resendId: d.email_id }, data: { openCount: { increment: 1 } } })
        .catch(() => {});
    }
    // Lead scoring: +1 al engagement del suscriptor que abre.
    for (const email of extractEmails(event.data)) {
      await prisma.newsletterSubscriber
        .updateMany({
          where: { email },
          data: { engagementScore: { increment: 1 }, lastOpenedAt: now },
        })
        .catch(() => {});
    }
  }

  // CLIC → estadística + lead scoring (señal más fuerte que abrir).
  if (type === "email.clicked") {
    const d = event.data as { email_id?: string };
    const now = new Date();
    if (d?.email_id) {
      await prisma.broadcastDelivery
        .updateMany({ where: { resendId: d.email_id, clickedAt: null }, data: { clickedAt: now } })
        .catch(() => {});
      await prisma.broadcastDelivery
        .updateMany({ where: { resendId: d.email_id }, data: { clickCount: { increment: 1 } } })
        .catch(() => {});
    }
    // Un clic vale +2 de engagement y refresca recencia (cuenta como "activo").
    for (const email of extractEmails(event.data)) {
      await prisma.newsletterSubscriber
        .updateMany({
          where: { email },
          data: { engagementScore: { increment: 2 }, lastOpenedAt: now },
        })
        .catch(() => {});
    }
  }

  // ENTREGA → marca deliveredAt (primera vez). Permite ver el % de entrega de
  // cada broadcast en nuestro propio admin sin depender del dashboard de Resend.
  if (type === "email.delivered") {
    const d = event.data as { email_id?: string };
    if (d?.email_id) {
      await prisma.broadcastDelivery
        .updateMany({
          where: { resendId: d.email_id, deliveredAt: null },
          data: { deliveredAt: new Date() },
        })
        .catch(() => {});
    }
  }

  // 200 a todo lo demás — aceptados sin error.
  return NextResponse.json({ ok: true });
}
