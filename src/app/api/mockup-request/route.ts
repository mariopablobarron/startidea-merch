import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";
import { displayPositionId } from "@/lib/marking-position-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Capa D del sistema de mockup: el cliente prefiere mockup técnico real hecho
 * por el equipo en vez de la previsualización automática. Promesa pública:
 * mockup técnico con dimensiones exactas en 4h laborables, sin compromiso.
 *
 * Flujo:
 *   1. Cliente rellena formulario en la ficha del producto.
 *   2. Se persiste MockupRequest (lead capturado).
 *   3. Confirmación al cliente (template Startidea brand).
 *   4. Alerta Telegram al equipo + notificación email pedidos@.
 */

const RequestSchema = z.object({
  productSlug: z.string().min(1),
  positionId: z.string().optional().nullable(),
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  company: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  brief: z.string().max(2000).optional().nullable(),
  sourceUrl: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos incompletos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Producto (opcional pero útil para enlazar)
  const product = await prisma.product.findUnique({
    where: { slug: data.productSlug },
    select: { id: true, name: true },
  });

  const created = await prisma.mockupRequest.create({
    data: {
      productId: product?.id ?? null,
      productSlug: data.productSlug,
      positionId: data.positionId ?? null,
      name: data.name,
      email: data.email,
      company: data.company ?? null,
      phone: data.phone ?? null,
      brief: data.brief ?? null,
      sourceUrl: data.sourceUrl ?? null,
    },
  });

  const productName = product?.name || data.productSlug;
  const positionLabel = data.positionId ? displayPositionId(data.positionId) : null;
  const firstName = data.name.split(" ")[0];

  // 1) Email confirmación cliente (template Startidea)
  await sendEmail({
    to: data.email,
    subject: `${firstName}, recibimos tu petición de mockup — respuesta en 4h`,
    context: `mockup-request confirm · ${created.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Petición recibida</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName}.<br>
            <span style="color:#E63E73;">Te mandamos mockup técnico en 4h.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Recibimos tu petición de mockup para <strong>${productName}</strong>${positionLabel ? ` · ${positionLabel}` : ""}.
            Nuestro equipo te enviará el mockup técnico con las
            <strong>dimensiones exactas del área de marcaje</strong> y la técnica
            recomendada en <strong>menos de 4 horas laborables</strong>, sin compromiso.
          </p>
        </div>
        <div style="padding:0 32px 24px;">
          <div style="background:#F4EFE6;padding:18px 20px;border-radius:12px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Qué pasa ahora</p>
            <ol style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:#444;">
              <li>Recibimos tu petición y la revisamos.</li>
              <li>Preparamos mockup técnico real con medidas exactas.</li>
              <li>Te lo enviamos por email en menos de 4h laborables.</li>
              <li>Si te encaja, cerramos cotización con plazo y precio final.</li>
            </ol>
          </div>
        </div>
        ${
          data.brief
            ? `<div style="padding:0 32px 24px;">
                 <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Tu brief</p>
                 <div style="background:#FBDFE9;border-left:3px solid #E63E73;padding:14px 16px;border-radius:8px;font-size:14px;line-height:1.5;color:#2A2A2A;white-space:pre-wrap;">${data.brief.replace(/</g, "&lt;")}</div>
               </div>`
            : ""
        }
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
  });

  // 2) Alerta Telegram interna
  await notifyTelegram(
    `<b>🎨 Nueva petición de mockup</b>\n` +
      `${data.name}${data.company ? ` · ${data.company}` : ""}\n` +
      `${data.email}${data.phone ? ` · ${data.phone}` : ""}\n` +
      `Producto: <code>${productName}</code>${positionLabel ? ` · ${positionLabel}` : ""}\n` +
      (data.brief ? `Brief: ${data.brief.slice(0, 300)}\n` : "") +
      `Admin: ${SITE_URL}/admin/mockup-requests/${created.id}`,
    { parseMode: "HTML" },
  ).catch(() => {});

  // 3) Email interno al buzón pedidos@ (para tener pista en Gmail)
  if (process.env.RESEND_FROM_NOTIFY || process.env.RESEND_FROM) {
    await sendEmail({
      to: process.env.NOTIFY_INTERNAL_EMAIL || "pedidos@startidea.es",
      replyTo: data.email,
      subject: `[Mockup 4h] ${data.name}${data.company ? ` · ${data.company}` : ""} — ${productName}`,
      context: `mockup-request internal · ${created.id}`,
      html: `
      <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:24px 16px;color:#2A2A2A;">
        <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:24px 28px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#E63E73;">— Mockup 4h · solicitud</p>
          <h2 style="margin:6px 0 0;font-family:Georgia,serif;font-size:22px;color:#2A2A2A;">
            ${data.name}${data.company ? ` <span style="color:#a09e98;font-weight:400;">· ${data.company}</span>` : ""}
          </h2>
          <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b6b6b;width:120px;">Email</td><td>${data.email}</td></tr>
            ${data.phone ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Teléfono</td><td>${data.phone}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6b6b6b;">Producto</td><td>${productName}</td></tr>
            ${positionLabel ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Zona</td><td>${positionLabel}</td></tr>` : ""}
            ${data.sourceUrl ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Origen</td><td><a href="${data.sourceUrl}">${data.sourceUrl}</a></td></tr>` : ""}
          </table>
          ${
            data.brief
              ? `<p style="margin:16px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Brief</p>
                 <div style="margin-top:6px;padding:12px 14px;background:#F4EFE6;border-radius:10px;font-size:14px;line-height:1.5;white-space:pre-wrap;">${data.brief.replace(/</g, "&lt;")}</div>`
              : ""
          }
          <p style="margin:18px 0 0;font-size:11px;color:#a09e98;">ID: ${created.id}</p>
        </div>
      </div>`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, id: created.id });
}
