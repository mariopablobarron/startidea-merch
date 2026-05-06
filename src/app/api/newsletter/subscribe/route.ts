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

  // Email de bienvenida con link de baja
  if (resend) {
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe/${sub.unsubscribeToken}`;
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: data.email,
        subject: "Bienvenida · Newsletter mensual con casos reales",
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">Te tenemos en la lista.</h2>
          <p>Hola${data.name ? ` ${data.name.split(" ")[0]}` : ""},</p>
          <p>Una vez al mes te mandamos un email corto con casos reales de empresas que han producido merchandising con impacto social. Sin spam comercial, sin secuencias automatizadas vacías.</p>
          <p>Si en algún momento prefieres no recibirlos, te das de baja con un click <a href="${unsubUrl}" style="color:#ff6b35;">aquí</a>.</p>
          <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
        </div>`,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
