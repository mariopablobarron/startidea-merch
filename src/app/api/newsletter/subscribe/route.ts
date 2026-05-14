import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  company: z.string().max(160).optional(),
  source: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const data = parsed.data;

  // Upsert: si ya existe pero unsubscribed, lo reactivamos
  const sub = await prisma.newsletterSubscriber.upsert({
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

  // Si vino del popup lead-capture, incluir cupón de bienvenida WELCOME10
  const isLeadPopup = data.source === "lead-popup" || data.source === "exit-intent";
  const couponCode = isLeadPopup ? "WELCOME10" : null;

  // Email de bienvenida con link de baja (+ cupón si aplica)
  if (resend) {
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe/${sub.unsubscribeToken}`;
    const couponBlock = couponCode
      ? `<div style="margin:24px 0;padding:20px;border:2px dashed #E63E73;border-radius:16px;text-align:center;background:#FBE9F0;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#A02049;text-transform:uppercase;letter-spacing:1px;">Cupón bienvenida — 10% descuento</p>
          <p style="margin:12px 0 4px;font-family:Georgia,serif;font-size:32px;font-weight:700;color:#E63E73;letter-spacing:2px;">${couponCode}</p>
          <p style="margin:0;font-size:12px;color:#666;">Aplicable en tu primer pedido. Válido 30 días.</p>
        </div>
        <p style="text-align:center;margin:20px 0;">
          <a href="${SITE_URL}/catalogo" style="background:#E63E73;color:white;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Empezar a configurar mi pedido →</a>
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
          <p style="font-size:13px;color:#6b6b6b;">Si en algún momento prefieres no recibirlos, te das de baja con un click <a href="${unsubUrl}" style="color:#E63E73;">aquí</a>.</p>
          <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es</p>
        </div>`,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, couponCode });
}
