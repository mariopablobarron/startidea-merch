import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const LineSchema = z.object({
  productSlug: z.string().min(1),
  productRef: z.string().min(1),
  productName: z.string().min(1),
  primaryImageUrl: z.string().nullable().optional(),
  techniqueCode: z.string().nullable().optional(),
  techniqueName: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  numberOfColours: z.number().int().min(1).max(10).optional(),
  totalQty: z.number().int().positive().max(1_000_000),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
  notes: z.string().max(500).nullable().optional(),
});

const Schema = z.object({
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerCompany: z.string().max(160).optional().or(z.literal("")),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  briefRaw: z.string().max(5000),
  lines: z.array(LineSchema).min(1).max(40),
  sendPaymentLink: z.boolean().optional(),
  sendEmailToCustomer: z.boolean().optional(),
});

/**
 * Guarda el presupuesto generado por IA como CartQuote.
 *
 * Si sendPaymentLink=true → genera paymentLinkToken + status SENT
 * (cliente puede pagar directo en /pay/{token}).
 *
 * Si sendEmailToCustomer=true → envía email al cliente con resumen +
 * link al portal o pago.
 *
 * En cualquier caso notifica Telegram al equipo.
 */
export async function POST(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totalCents = data.lines.reduce((s, l) => s + l.totalPriceCents, 0);
  const paymentLinkToken = data.sendPaymentLink ? `pay_${randomBytes(20).toString("base64url")}` : null;

  const cart = await prisma.cartQuote.create({
    data: {
      name: data.customerName,
      email: data.customerEmail,
      company: data.customerCompany || null,
      phone: data.customerPhone || null,
      message: data.briefRaw,
      source: "ai-quote-builder",
      status: data.sendPaymentLink ? "SENT" : "IN_PROGRESS",
      estimatedTotalCents: totalCents,
      acceptedTotalCents: data.sendPaymentLink ? totalCents : null,
      depositPercent: data.sendPaymentLink ? 100 : null,
      paymentLinkToken,
      paymentLinkSentAt: data.sendPaymentLink ? new Date() : null,
      internalNotes: `Generado con IA Quote Builder por ${auth.session.email}`,
      items: {
        create: data.lines.map((l) => ({
          productSlug: l.productSlug,
          productRef: l.productRef,
          productName: l.productName,
          primaryImageUrl: l.primaryImageUrl ?? null,
          quantity: l.totalQty,
          markingTechniqueCode: l.techniqueCode ?? null,
          markingTechniqueName: l.techniqueName ?? null,
          markingPositionId: l.positionId ?? null,
          markingColours: l.numberOfColours ?? null,
          unitPriceClientCents: l.unitPriceCents,
          totalClientCents: l.totalPriceCents,
          notes: l.notes ?? null,
        })),
      },
    },
  });

  // Email cliente
  if (data.sendEmailToCustomer && resend) {
    const firstName = data.customerName.split(" ")[0] || "";
    const itemsHtml = data.lines
      .map(
        (l) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;">${l.productName}<br><small style="color:#888">${l.productRef}${l.techniqueName ? ` · ${l.techniqueName}` : ""}</small></td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${l.totalQty}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${EUR.format(l.totalPriceCents / 100)}</td>
        </tr>`,
      )
      .join("");

    const ctaUrl = paymentLinkToken
      ? `${SITE_URL}/pay/${paymentLinkToken}`
      : `${SITE_URL}/clientes/login`;
    const ctaLabel = paymentLinkToken ? "Pagar y confirmar pedido →" : "Ver mi cotización en el portal →";

    await resend.emails.send({
      from: RESEND_FROM,
      to: data.customerEmail,
      subject: `${firstName ? firstName + ", t" : "T"}u cotización cerrada · TodoMerchandising`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#2A2A2A;">
        <h2 style="font-family:Georgia,serif;">Cotización cerrada</h2>
        <p>Hola ${firstName || data.customerName},</p>
        <p>Aquí tienes el presupuesto cerrado para tu pedido:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#F4EFE6;">
              <th style="padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Producto</th>
              <th style="padding:10px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Cant.</th>
              <th style="padding:10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr><td colspan="2" style="padding:12px;text-align:right;font-weight:600;">Total:</td>
            <td style="padding:12px;text-align:right;font-weight:700;font-size:18px;color:#E63E73;">${EUR.format(totalCents / 100)}</td></tr>
          </tfoot>
        </table>
        <p style="margin-top:24px;text-align:center;">
          <a href="${ctaUrl}" style="background:#E63E73;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">${ctaLabel}</a>
        </p>
        <p style="font-size:13px;color:#666;margin-top:24px;">Plazo de entrega típico 7-15 días laborables desde aprobación del mockup. Precios incluyen marcaje en la técnica indicada. IVA no incluido (21% aplicable). Si necesitas factura pro-forma o ajustar cantidades, responde a este email.</p>
        <p style="color:#666;font-size:11px;margin-top:24px;">Ref interna: <code>${cart.id.slice(0, 8)}</code><br>STARTIDEA MALAGA SL · CIF B19583632</p>
      </div>`,
    }).catch((err) => console.error("[ai-quote save email]", err));
  }

  // Telegram al equipo
  void notifyTelegram(
    `✨ <b>Cotización IA guardada</b>\n${data.customerName}${data.customerCompany ? ` · ${data.customerCompany}` : ""}\n${data.lines.length} líneas · <b>${EUR.format(totalCents / 100)}</b>${paymentLinkToken ? "\n💳 Link de pago activo" : ""}\nCart <code>${cart.id.slice(0, 8)}</code>`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    cartId: cart.id,
    paymentLinkToken,
    payUrl: paymentLinkToken ? `${SITE_URL}/pay/${paymentLinkToken}` : null,
  });
}
