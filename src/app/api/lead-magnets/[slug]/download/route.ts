import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const Schema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  name: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  utm: z
    .object({
      source: z.string().max(60).optional(),
      medium: z.string().max(60).optional(),
      campaign: z.string().max(120).optional(),
    })
    .optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Acepta política de privacidad" }) }),
});

/**
 * POST /api/lead-magnets/[slug]/download
 * Body: { email, name?, company?, utm?, consent: true }
 *
 * Captura email del visitante, registra LeadDownload, suscribe a
 * NewsletterSubscriber (opt-in vía consent), envía email con link al PDF
 * y devuelve fileUrl al cliente para descarga inmediata.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const magnet = await prisma.leadMagnet.findUnique({ where: { slug } });
  if (!magnet || !magnet.active) {
    return NextResponse.json({ error: "Recurso no disponible" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;

  // Hash IP para anti-spam (no PII real)
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "0.0.0.0";
  const ipHash = createHash("sha256").update(`${ip}:${slug}`).digest("hex").slice(0, 16);
  const referer = req.headers.get("referer") || null;

  // Crear LeadDownload
  await prisma.leadDownload.create({
    data: {
      magnetId: magnet.id,
      email: d.email,
      name: d.name || null,
      company: d.company || null,
      source: d.utm?.source || null,
      medium: d.utm?.medium || null,
      campaign: d.utm?.campaign || null,
      referer,
      ipHash,
    },
  });

  await prisma.leadMagnet.update({
    where: { id: magnet.id },
    data: { downloadCount: { increment: 1 } },
  });

  // Suscribir a newsletter (idempotente)
  await prisma.newsletterSubscriber.upsert({
    where: { email: d.email },
    update: { unsubscribedAt: null },
    create: {
      email: d.email,
      name: d.name || null,
      company: d.company || null,
      source: `lead-magnet:${slug}`,
    },
  });

  // Email con link
  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: d.email,
        subject: `Tu descarga: ${magnet.title}`,
        html: `
<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#2A2A2A;">
  <h2 style="font-family:Georgia,serif;color:#2A2A2A;">Aquí tienes tu descarga</h2>
  <p>Hola${d.name ? ` ${d.name.split(" ")[0]}` : ""},</p>
  <p>Gracias por descargar <strong>${magnet.title}</strong>. Aquí tienes el archivo:</p>
  <p style="margin:24px 0;">
    <a href="${magnet.fileUrl}" style="display:inline-block;background:#E63E73;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Descargar PDF →</a>
  </p>
  <p style="color:#666;font-size:14px;">¿Te gustó? Entra al catálogo cuando quieras — verás precio al instante en cada producto.</p>
  <p style="margin:20px 0;">
    <a href="${SITE_URL}/catalogo" style="color:#E63E73;">Ver catálogo</a> ·
    <a href="${SITE_URL}/#cotizar" style="color:#E63E73;">Pedir cotización</a>
  </p>
  <hr style="border:none;border-top:1px solid #EAE3D3;margin:32px 0;">
  <p style="color:#888;font-size:11px;">STARTIDEA MALAGA SL · CIF B19583632 · Granada</p>
</div>`,
        text: `Hola${d.name ? ` ${d.name.split(" ")[0]}` : ""},\n\nDescarga: ${magnet.fileUrl}\n\nGracias por tu interés en TodoMerchandising.`,
      })
      .catch(() => {});
  }

  // Notificar a Telegram al equipo
  void notifyTelegram(
    `📥 <b>Nuevo lead</b>\n${d.email}${d.name ? ` · ${d.name}` : ""}${d.company ? ` · ${d.company}` : ""}\nDescargó: ${magnet.title}${d.utm?.campaign ? `\nCampaña: ${d.utm.campaign}` : ""}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    fileUrl: magnet.fileUrl,
    message: "Descarga preparada. Revisa tu email también.",
  });
}
