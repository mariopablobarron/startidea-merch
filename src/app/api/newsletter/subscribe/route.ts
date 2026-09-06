import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { NewsletterSubscribeSchema } from "@/lib/newsletter-subscribe-schema";
import {
  enqueueHubIntake,
  flushHubIntakeOutboxNow,
  newHubIntakeEventId,
} from "@/lib/hub-intake-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export async function POST(req: Request) {
  // Esta ruta escribe en BD y dispara un email real de Resend a la dirección
  // que le manden: sin tope, sirve para enviar correo con nuestro dominio a
  // terceros que no lo han pedido, y eso se paga en entregabilidad. Alta
  // legítima es un acto único por persona, así que 5/hora por IP sobra
  // (medido: 3 altas orgánicas en los últimos 14 días).
  const rl = rateLimit(req, { key: "newsletter-subscribe", max: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = NewsletterSubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const data = parsed.data;

  // Cada alta/reactivación es un evento propio. Su ID aleatorio se genera antes
  // de la transacción y no deriva del email ni expone PII.
  const outboxId = newHubIntakeEventId();
  const occurredAt = new Date();
  const sub = await prisma.$transaction(async (tx) => {
    const sub = await tx.newsletterSubscriber.upsert({
      where: { email: data.email },
      create: {
        email: data.email,
        name: data.name,
        company: data.company,
        source: data.source || "home-footer",
      },
      update: {
        name: data.name ?? undefined,
        company: data.company ?? undefined,
        unsubscribedAt: null,
      },
    });
    await enqueueHubIntake(tx, {
      schemaVersion: 1,
      submissionId: outboxId,
      kind: "newsletter",
      form: "newsletter-subscribe",
      occurredAt: occurredAt.toISOString(),
      contact: {
        email: sub.email,
        ...(sub.name ? { name: sub.name } : {}),
      },
      ...(sub.company ? { organization: { name: sub.company } } : {}),
      subject: "Alta en newsletter de TodoMerchandising",
      details: { source: data.source || "home-footer" },
      consents: { marketing: true },
    }, outboxId);
    return sub;
  });

  await flushHubIntakeOutboxNow(outboxId);

  // Si vino del popup lead-capture, incluir cupón de bienvenida WELCOME10
  const isLeadPopup = data.source === "lead-popup" || data.source === "exit-intent";
  const couponCode = isLeadPopup ? "WELCOME10" : null;

  // Email de bienvenida con link de baja (+ cupón si aplica)
  if (resend) {
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe/${sub.unsubscribeToken}`;
    const couponBlock = couponCode
      ? `<div style="margin:24px 0;padding:20px;border:2px dashed #C41D51;border-radius:16px;text-align:center;background:#FBE9F0;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#8F1039;text-transform:uppercase;letter-spacing:1px;">Cupón bienvenida — 10% descuento</p>
          <p style="margin:12px 0 4px;font-family:Georgia,serif;font-size:32px;font-weight:700;color:#C41D51;letter-spacing:2px;">${couponCode}</p>
          <p style="margin:0;font-size:12px;color:#666;">Aplicable en tu primer pedido. Válido 30 días.</p>
        </div>
        <p style="text-align:center;margin:20px 0;">
          <a href="${SITE_URL}/catalogo" style="background:#C41D51;color:white;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Empezar a configurar mi pedido →</a>
        </p>`
      : "";

    void resend.emails
      .send({
        from: RESEND_FROM,
        to: data.email,
        subject: couponCode
          ? "Tu cupón WELCOME10 + bienvenida a TodoMerchandising"
          : "Bienvenida · Newsletter mensual con casos reales",
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">Te tenemos en la lista.</h2>
          <p>Hola${data.name ? ` ${data.name.split(" ")[0]}` : ""},</p>
          ${couponCode
            ? `<p>Gracias por suscribirte. Como prometimos, aquí tienes tu <strong>10% de descuento</strong> en tu primer pedido:</p>${couponBlock}<p>Una vez al mes te mandamos un email corto con casos reales de empresas que han producido merchandising con impacto. Sin spam comercial.</p>`
            : `<p>Una vez al mes te mandamos un email corto con casos reales de empresas que han producido merchandising con impacto. Sin spam comercial, sin secuencias automatizadas vacías.</p>`}
          <p style="font-size:13px;color:#6b6b6b;">Si en algún momento prefieres no recibirlos, te das de baja con un click <a href="${unsubUrl}" style="color:#C41D51;">aquí</a>.</p>
          <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es</p>
        </div>`,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, couponCode });
}
