import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { displayPositionId } from "@/lib/marking-position-display";
import { standalonePositionLabel } from "@/lib/marking-position-label";
import { rateLimit } from "@/lib/rate-limit";
import { publicProductName } from "@/lib/product-name";
import { resolveProductBySlug } from "@/lib/product-slug-resolver";
import { escapeHtml } from "@/lib/email-templates";
import { MockupRequestSchema } from "@/lib/mockup-request-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

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


export async function POST(req: Request) {
  // Anti-spam: 5 peticiones de mockup/5 min por IP.
  const rl = rateLimit(req, { key: "mockup-request", max: 5, windowMs: 5 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = MockupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos incompletos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Producto (opcional pero útil para enlazar)
  const resolved = await resolveProductBySlug(data.productSlug, (slug) =>
    prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        override: { select: { customName: true } },
      },
    }),
  );
  const product = resolved?.product;

  const created = await prisma.mockupRequest.create({
    data: {
      productId: product?.id ?? null,
      productSlug: resolved?.canonicalSlug ?? data.productSlug,
      positionId: data.positionId ?? null,
      name: data.name,
      email: data.email,
      company: data.company ?? null,
      phone: data.phone ?? null,
      brief: data.brief ?? null,
      sourceUrl: data.sourceUrl ?? null,
    },
  });

  const productName = product
    ? publicProductName(product.name, product.override?.customName)
    : data.productSlug;
  // Dos etiquetas distintas a propósito. Dentro (Telegram, buzón de pedidos@) hace
  // falta que la zona salga SIEMPRE, aunque el código no diga nada: es con lo que
  // el equipo localiza el área para dibujar el mockup. Al cliente, en cambio,
  // «Default» no le dice dónde va su logo y delata el feed, así que ahí se calla.
  const positionLabel = data.positionId ? displayPositionId(data.positionId) : null;
  const clientPositionLabel = standalonePositionLabel(data.positionId);
  const firstName = data.name.split(" ")[0];

  // 1) Email confirmación cliente (template Startidea)
  await sendEmail({
    to: data.email,
    subject: `${firstName}, recibimos tu petición de mockup — respuesta en 4h`,
    context: `mockup-request confirm · ${created.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#FFFFFF;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#231F27;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Petición recibida</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#231F27;">
            Hola ${escapeHtml(firstName)}.<br>
            <span style="color:#C41D51;">Te mandamos mockup técnico en 4h.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Recibimos tu petición de mockup para <strong>${escapeHtml(productName)}</strong>${clientPositionLabel ? ` · ${escapeHtml(clientPositionLabel)}` : ""}.
            Nuestro equipo te enviará el mockup técnico con las
            <strong>dimensiones exactas del área de marcaje</strong> y la técnica
            recomendada en <strong>menos de 4 horas laborables</strong>, sin compromiso.
          </p>
        </div>
        <div style="padding:0 32px 24px;">
          <div style="background:#FFFFFF;padding:18px 20px;border-radius:12px;">
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
                 <div style="background:#F8DCE6;border-left:3px solid #C41D51;padding:14px 16px;border-radius:8px;font-size:14px;line-height:1.5;color:#231F27;white-space:pre-wrap;">${escapeHtml(data.brief)}</div>
               </div>`
            : ""
        }
        <div style="background:#231F27;padding:20px 32px;color:rgba(255,255,255,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#C41D51;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
  });

  // 2) Alerta Telegram interna
  await notifyTelegram(
    `<b>🎨 Nueva petición de mockup</b>\n` +
      `${escapeTgHtml(data.name)}${data.company ? ` · ${escapeTgHtml(data.company)}` : ""}\n` +
      `${escapeTgHtml(data.email)}${data.phone ? ` · ${escapeTgHtml(data.phone)}` : ""}\n` +
      `Producto: <code>${escapeTgHtml(productName)}</code>${positionLabel ? ` · ${escapeTgHtml(positionLabel)}` : ""}\n` +
      (data.brief ? `Brief: ${escapeTgHtml(data.brief.slice(0, 300))}\n` : "") +
      `Admin: ${SITE_URL}/admin/mockup-requests/${created.id}`,
    { parseMode: "HTML" },
  ).catch((e) =>
    console.error("[mockup-request] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  // 3) Email interno al buzón pedidos@ (para tener pista en Gmail)
  if (process.env.RESEND_FROM_NOTIFY || process.env.RESEND_FROM) {
    await sendEmail({
      to: process.env.NOTIFY_INTERNAL_EMAIL || "pedidos@startidea.es",
      replyTo: data.email,
      subject: `[Mockup 4h] ${data.name}${data.company ? ` · ${data.company}` : ""} — ${productName}`,
      context: `mockup-request internal · ${created.id}`,
      html: `
      <div style="font-family:Helvetica,Arial,sans-serif;background:#FFFFFF;padding:24px 16px;color:#231F27;">
        <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:24px 28px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C41D51;">— Mockup 4h · solicitud</p>
          <h2 style="margin:6px 0 0;font-family:Georgia,serif;font-size:22px;color:#231F27;">
            ${escapeHtml(data.name)}${data.company ? ` <span style="color:#a09e98;font-weight:400;">· ${escapeHtml(data.company)}</span>` : ""}
          </h2>
          <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b6b6b;width:120px;">Email</td><td>${escapeHtml(data.email)}</td></tr>
            ${data.phone ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Teléfono</td><td>${escapeHtml(data.phone)}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6b6b6b;">Producto</td><td>${escapeHtml(productName)}</td></tr>
            ${positionLabel ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Zona</td><td>${escapeHtml(positionLabel)}</td></tr>` : ""}
            ${data.sourceUrl ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Origen</td><td>${escapeHtml(data.sourceUrl)}</td></tr>` : ""}
          </table>
          ${
            data.brief
              ? `<p style="margin:16px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Brief</p>
                 <div style="margin-top:6px;padding:12px 14px;background:#FFFFFF;border-radius:10px;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(data.brief)}</div>`
              : ""
          }
          <p style="margin:18px 0 0;font-size:11px;color:#a09e98;">ID: ${escapeHtml(created.id)}</p>
        </div>
      </div>`,
    }).catch((e) =>
      console.error("[mockup-request] sendEmail interno falló:", e instanceof Error ? e.message : e),
    );
  }

  return NextResponse.json({ ok: true, id: created.id });
}
