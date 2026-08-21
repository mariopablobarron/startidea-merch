import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import {
  LeadMagnetDownloadSchema,
  buildLeadMagnetEmailHtml,
  buildLeadMagnetEmailText,
} from "@/lib/lead-magnet-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * POST /api/lead-magnets/[slug]/download
 * Body: { email, name?, company?, utm?, consent: true }
 *
 * Captura email del visitante, registra LeadDownload, suscribe a
 * NewsletterSubscriber (opt-in vía consent), envía email con link al PDF
 * y devuelve fileUrl al cliente para descarga inmediata.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Ruta pública y sin auth que persiste dos filas, manda un email real de
  // Resend a la dirección que le den y avisa al Telegram del equipo. Sin tope
  // sirve para enviar correo con nuestro dominio a terceros que no lo han
  // pedido —y para tapar de ruido el canal de leads—. Descargar un recurso es
  // un acto puntual: 10/hora por IP no lo alcanza nadie legítimo ni con los 4
  // recursos activos (medido: 0 descargas en la tabla). El bucket es por IP y
  // NO por slug, para que rotar de recurso no multiplique el cupo.
  const rl = rateLimit(req, { key: "lead-magnet-download", max: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const { slug } = await params;
  const magnet = await prisma.leadMagnet.findUnique({ where: { slug } });
  if (!magnet || !magnet.active) {
    return NextResponse.json({ error: "Recurso no disponible" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = LeadMagnetDownloadSchema.safeParse(body);
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
        html: buildLeadMagnetEmailHtml({
          name: d.name,
          magnetTitle: magnet.title,
          fileUrl: magnet.fileUrl,
          siteUrl: SITE_URL,
        }),
        text: buildLeadMagnetEmailText({
          name: d.name,
          magnetTitle: magnet.title,
          fileUrl: magnet.fileUrl,
          siteUrl: SITE_URL,
        }),
      })
      .catch(() => {});
  }

  // Notificar a Telegram al equipo
  void notifyTelegram(
    `📥 <b>Nuevo lead</b>\n${escapeTgHtml(d.email)}${d.name ? ` · ${escapeTgHtml(d.name)}` : ""}${d.company ? ` · ${escapeTgHtml(d.company)}` : ""}\nDescargó: ${escapeTgHtml(magnet.title)}${d.utm?.campaign ? `\nCampaña: ${escapeTgHtml(d.utm.campaign)}` : ""}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    fileUrl: magnet.fileUrl,
    message: "Descarga preparada. Revisa tu email también.",
  });
}
