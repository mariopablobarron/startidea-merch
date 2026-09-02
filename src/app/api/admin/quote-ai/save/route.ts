import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/resend";
import { escapeTgHtml, notifyTelegram } from "@/lib/telegram";
import {
  emailShell,
  emailHeader,
  emailPara,
  emailButton,
  emailFinePrint,
  escapeHtml,
} from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

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
  if (data.sendEmailToCustomer) {
    const firstName = data.customerName.split(" ")[0] || "";
    const itemsHtml = data.lines
      .map(
        (l) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(l.productName)}<br><small style="color:#888">${escapeHtml(l.productRef)}${l.techniqueName ? ` · ${escapeHtml(l.techniqueName)}` : ""}</small></td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${l.totalQty}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${EUR.format(l.totalPriceCents / 100)}</td>
        </tr>`,
      )
      .join("");

    const ctaUrl = paymentLinkToken
      ? `${SITE_URL}/pay/${paymentLinkToken}`
      : `${SITE_URL}/clientes/login`;
    const ctaLabel = paymentLinkToken ? "Pagar y confirmar pedido →" : "Ver mi cotización en el portal →";

    await sendEmail({
      to: data.customerEmail,
      subject: `${firstName ? firstName + ", t" : "T"}u cotización cerrada · TodoMerchandising`,
      context: `quote-ai cerrado · ${cart.id}`,
      html: emailShell(
        emailHeader("Cotización cerrada", `Hola ${escapeHtml(firstName || data.customerName)},`) +
          emailPara("Aquí tienes el presupuesto cerrado para tu pedido:") +
          `<tr><td style="padding:20px 40px 0">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#F4EFE6">
                  <th style="padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Producto</th>
                  <th style="padding:10px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Cant.</th>
                  <th style="padding:10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
              <tfoot>
                <tr><td colspan="2" style="padding:12px;text-align:right;font-weight:600">Total:</td>
                <td style="padding:12px;text-align:right;font-weight:700;font-size:18px;color:#E63E73">${EUR.format(totalCents / 100)}</td></tr>
              </tfoot>
            </table>
          </td></tr>` +
          emailButton(ctaUrl, ctaLabel) +
          emailFinePrint(
            `Plazo de entrega típico 7-15 días laborables desde aprobación del mockup. Precios incluyen marcaje en la técnica indicada. IVA no incluido (21% aplicable). Si necesitas factura pro-forma o ajustar cantidades, responde a este email.<br><br>Ref interna: <code>${cart.id.slice(0, 8)}</code>`,
          ),
        `Presupuesto cerrado: ${EUR.format(totalCents / 100)} — confirma cuando quieras`,
      ),
    }).catch((err) => console.error("[ai-quote save email]", err));
  }

  // Telegram al equipo
  // El nombre y la empresa del cliente los teclea quien cotiza (o los propone
  // la IA a partir del texto del cliente): un `&` o un `<` sin escapar hace que
  // Telegram devuelva 400 y el equipo no vea la cotización ni el link de pago.
  void notifyTelegram(
    `✨ <b>Cotización IA guardada</b>\n${escapeTgHtml(data.customerName)}${data.customerCompany ? ` · ${escapeTgHtml(data.customerCompany)}` : ""}\n${data.lines.length} líneas · <b>${EUR.format(totalCents / 100)}</b>${paymentLinkToken ? "\n💳 Link de pago activo" : ""}\nCart <code>${cart.id.slice(0, 8)}</code>`,
  ).catch((e) =>
    console.error("[quote-ai-save] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({
    ok: true,
    cartId: cart.id,
    paymentLinkToken,
    payUrl: paymentLinkToken ? `${SITE_URL}/pay/${paymentLinkToken}` : null,
  });
}
