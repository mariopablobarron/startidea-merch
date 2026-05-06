import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { notifyAdmins } from "@/lib/notify-admin";
import { validateCoupon, applyCoupon } from "@/lib/coupons";
import { notifyTelegram } from "@/lib/telegram";
import { readPartnerSlug, attachReferral } from "@/lib/referral";

export const runtime = "nodejs";

const ItemSchema = z.object({
  productSlug: z.string().min(1),
  productRef: z.string().min(1),
  productName: z.string().min(1),
  primaryImageUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000),
  variantSku: z.string().nullable().optional(),
  colorName: z.string().nullable().optional(),
  markingTechniqueCode: z.string().nullable().optional(),
  markingTechniqueName: z.string().nullable().optional(),
  markingPositionId: z.string().nullable().optional(),
  markingColours: z.number().int().min(1).max(10).nullable().optional(),
  markingComplexity: z.string().length(1).nullable().optional(),
  unitPriceClientCents: z.number().int().nullable().optional(),
  totalClientCents: z.number().int().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const Schema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional().or(z.literal("")),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal("")),
  message: z.string().max(4000).optional().or(z.literal("")),
  deadline: z.string().max(120).optional().or(z.literal("")),
  source: z.string().max(80).optional(),
  couponCode: z.string().max(40).optional().or(z.literal("")),
  items: z.array(ItemSchema).min(1).max(40),
});

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const total = data.items.reduce((sum, it) => sum + (it.totalClientCents || 0), 0);

  const cart = await prisma.cartQuote.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      message: data.message || null,
      deadline: data.deadline || null,
      source: data.source || "carrito",
      estimatedTotalCents: total,
      items: {
        create: data.items.map((it) => ({
          productSlug: it.productSlug,
          productRef: it.productRef,
          productName: it.productName,
          primaryImageUrl: it.primaryImageUrl ?? null,
          quantity: it.quantity,
          variantSku: it.variantSku ?? null,
          colorName: it.colorName ?? null,
          markingTechniqueCode: it.markingTechniqueCode ?? null,
          markingTechniqueName: it.markingTechniqueName ?? null,
          markingPositionId: it.markingPositionId ?? null,
          markingColours: it.markingColours ?? null,
          markingComplexity: it.markingComplexity ?? null,
          unitPriceClientCents: it.unitPriceClientCents ?? null,
          totalClientCents: it.totalClientCents ?? null,
          notes: it.notes ?? null,
        })),
      },
    },
    include: { items: true },
  });

  // Notificar por email (best-effort, no bloquea respuesta)
  if (resend) {
    void Promise.all([
      resend.emails.send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        replyTo: data.email,
        subject: `[Carrito] ${data.name}${data.company ? " · " + data.company : ""} · ${EUR.format(total / 100)}`,
        html: internalCartHtml(cart),
      }),
      resend.emails.send({
        from: RESEND_FROM,
        to: data.email,
        subject: `${data.name.split(" ")[0]}, recibimos tu cotización con ${cart.items.length} producto${cart.items.length === 1 ? "" : "s"}`,
        html: clientCartHtml(cart),
      }),
    ]).catch((err) => console.error("[cart-quote] resend error", err));
  }

  // Si hay referral activo (cookie o querystring), asociar partner
  const refSlug = readPartnerSlug(req);
  if (refSlug) {
    void attachReferral(cart.id, refSlug).catch(() => {});
  }

  // Aplicar cupón si llegó (silencioso si falla — el admin puede decidir)
  if (data.couponCode) {
    const validation = await validateCoupon(data.couponCode, total);
    if (validation.ok) {
      await applyCoupon(cart.id, validation.coupon.id, validation.discountCents);
      await prisma.cartQuote.update({
        where: { id: cart.id },
        data: {
          internalNotes: `Cupón aplicado: ${validation.coupon.code} (${validation.coupon.label}) · descuento ${(validation.discountCents / 100).toFixed(2)} €`,
        },
      });
    }
  }

  // Notificación push al equipo (fire-and-forget)
  void notifyAdmins({
    title: `Nuevo carrito · ${data.name}`,
    body: `${cart.items.length} producto${cart.items.length === 1 ? "" : "s"} · ${EUR.format(total / 100)}${data.company ? ` · ${data.company}` : ""}`,
    url: `/admin/cart-quotes/${cart.id}`,
    tag: `cart-${cart.id}`,
    requireInteraction: true,
  }).catch((err) => console.error("[cart-quote push]", err));

  void notifyTelegram(
    `🛒 <b>Nuevo carrito</b>\n${data.name}${data.company ? ` · ${data.company}` : ""}\n${cart.items.length} productos · <b>${EUR.format(total / 100)}</b>\n📧 ${data.email}`,
  ).catch(() => {});

  return NextResponse.json({ ok: true, id: cart.id, items: cart.items.length });
}

function internalCartHtml(cart: { id: string; name: string; company: string | null; email: string; phone: string | null; message: string | null; deadline: string | null; estimatedTotalCents: number | null; items: Array<{ productName: string; productRef: string; quantity: number; markingTechniqueName: string | null; markingPositionId: string | null; markingColours: number | null; totalClientCents: number | null }> }): string {
  const rows = cart.items
    .map(
      (it) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;">${it.productName}<br><small style="color:#888">${it.productRef}</small></td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;">${it.markingTechniqueName ? `${it.markingTechniqueName} en ${it.markingPositionId}${it.markingColours && it.markingColours > 1 ? ` (${it.markingColours} col.)` : ""}` : "—"}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:0 auto;color:#0a0a0b;">
      <h2 style="font-family:Georgia,serif;color:#0a0a0b;">Nueva cotización con carrito</h2>
      <p><strong>${cart.name}</strong>${cart.company ? ` · ${cart.company}` : ""}<br>
      ${cart.email}${cart.phone ? ` · ${cart.phone}` : ""}</p>
      ${cart.deadline ? `<p>Fecha límite: <strong>${cart.deadline}</strong></p>` : ""}
      ${cart.message ? `<p style="background:#faf8f4;padding:12px;border-radius:8px;">${cart.message.replace(/\n/g, "<br>")}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#faf8f4;">
            <th style="padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Producto</th>
            <th style="padding:10px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Cant.</th>
            <th style="padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Marcaje</th>
            <th style="padding:10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3" style="padding:12px;text-align:right;font-weight:600;">Total estimado:</td>
          <td style="padding:12px;text-align:right;font-weight:600;font-size:18px;">${cart.estimatedTotalCents != null ? EUR.format(cart.estimatedTotalCents / 100) : "—"}</td></tr>
        </tfoot>
      </table>
      <p style="margin-top:24px;color:#888;font-size:12px;">ID: <code>${cart.id}</code></p>
    </div>`;
}

function clientCartHtml(cart: { id: string; name: string; items: Array<unknown>; estimatedTotalCents: number | null }): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;color:#0a0a0b;">
      <h2 style="font-family:Georgia,serif;">Hola ${cart.name.split(" ")[0]},</h2>
      <p>Hemos recibido tu cotización con <strong>${cart.items.length} producto${cart.items.length === 1 ? "" : "s"}</strong> ${cart.estimatedTotalCents ? `por un total estimado de <strong>${EUR.format(cart.estimatedTotalCents / 100)}</strong>` : ""}.</p>
      <p>Un humano de TodoMerchandising la revisa ahora mismo y te enviamos cotización cerrada con mockup, plazo y transporte en menos de 24 horas laborables.</p>
      <p style="margin-top:24px;">Si quieres añadir información, simplemente respóndeme a este email.</p>
      <p style="color:#888;font-size:12px;margin-top:32px;">
        Referencia interna: <code>${cart.id}</code><br>
        STARTIDEA MALAGA SL · CIF B19583632 · Granada
      </p>
    </div>`;
}
