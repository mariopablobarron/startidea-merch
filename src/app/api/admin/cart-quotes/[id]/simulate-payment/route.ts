import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { createPurchaseOrdersFromCart } from "@/lib/purchase-orders";
import { sendEmail } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";
import { syncPaymentToFacturaScripts } from "@/lib/facturascripts-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simula un pago confirmado SIN tocar Stripe (gratis, infinitas veces).
 *
 * Reproduce el flow real del webhook checkout.session.completed:
 *  1. Crea Payment con status=PAID (kind=DEPOSIT, stripeMode="simulated")
 *  2. Marca CartQuote como ORDERED
 *  3. Dispara split en PurchaseOrders (1 por supplier)
 *  3b. Sincroniza con FacturaScripts (crea factura legal en MALAGA idempresa=2)
 *  4. NO llama autoPlaceMidoceanOrder (evita pedido real al proveedor)
 *  5. Manda email cliente con prefijo [TEST] + alerta Telegram al admin
 *
 * Útil para:
 *  - Validar todo el flow post-pago en producción sin cobrar
 *  - Probar plantillas de email reales con datos reales
 *  - Verificar que el split + drips + dashboard funcionan
 *  - Validar la integración FacturaScripts end-to-end sin Stripe LIVE
 *
 * Idempotente: si el cart ya tiene Payment PAID, no crea otro.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    include: { items: true, payments: { where: { status: "PAID" } } },
  });
  if (!cart) return NextResponse.json({ error: "Cart no encontrado" }, { status: 404 });

  // Anti-doble-simulación
  if (cart.payments.length > 0 && cart.status === "ORDERED") {
    return NextResponse.json({
      ok: false,
      reason: `Cart ya está en ORDERED con ${cart.payments.length} payment(s). No volvemos a simular.`,
    }, { status: 409 });
  }

  // Importe: usar acceptedTotalCents si está, si no la suma de items
  const amountCents = cart.acceptedTotalCents
    || cart.items.reduce((s, it) => s + (it.totalClientCents || 0), 0)
    || 100;

  // 1) Crear Payment fake
  const payment = await prisma.payment.create({
    data: {
      cartId: cart.id,
      amountCents,
      currency: "EUR",
      status: "PAID",
      kind: "DEPOSIT",
      stripeMode: "simulated",
      stripeSessionId: `sim_${randomBytes(12).toString("hex")}`,
      paidAt: new Date(),
    },
  });

  // 2) Cart → ORDERED
  await prisma.cartQuote.update({
    where: { id: cart.id },
    data: {
      status: "ORDERED",
      orderedAt: new Date(),
    },
  });

  // 3) Split en PurchaseOrders
  const purchaseOrders = await createPurchaseOrdersFromCart(cart.id);

  // 3b) Sincronizar con FacturaScripts (factura legal en facturas.startidea.tech,
  // idempresa=2 STARTIDEA MALAGA SL). Permite validar el flow de facturación
  // sin pasar por Stripe LIVE. Devolvemos el resultado en la respuesta JSON
  // para que admin vea si se creó la factura, qué código, o qué error hubo.
  // Si falla, NO rompe la simulación (igual que en el webhook real de Stripe).
  const fsResult = await syncPaymentToFacturaScripts(payment.id).catch((err) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : String(err),
  }));

  // 4) Email cliente [TEST] (no manda pedido real a proveedor)
  const firstName = cart.name.split(" ")[0];
  const emailResult = await sendEmail({
    to: cart.email,
    subject: `[TEST] ${firstName}, simulación de pago confirmado · ${(amountCents / 100).toFixed(2)} €`,
    context: `simulate-payment · ${cart.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#E63E73;">— Simulación · entorno admin</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:24px;line-height:1.15;">
            Hola ${firstName}.<br>
            <span style="color:#E63E73;">Esto sería el email post-pago real.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#444;">
            Este email se envía porque alguien con acceso admin disparó la simulación
            de pago para el cart <code>${cart.id.slice(0, 12)}</code>.
            <strong>NO se ha cobrado nada</strong>.
          </p>
          <ul style="margin:16px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:#444;">
            <li>Cart marcado como ORDERED</li>
            <li>Payment fake creado por ${(amountCents / 100).toFixed(2)} €</li>
            <li>${purchaseOrders.length} PurchaseOrder${purchaseOrders.length !== 1 ? "s" : ""} generado${purchaseOrders.length !== 1 ? "s" : ""}</li>
            <li>NO se ha mandado pedido a MidOcean (auto-place skipped)</li>
          </ul>
        </div>
      </div>
    </div>`,
  });

  // 5) Alerta Telegram
  await notifyTelegram(
    `🧪 <b>Simulación de pago disparada</b>\n` +
      `Cart <code>${cart.id.slice(0, 8)}</code> · ${cart.name}\n` +
      `Importe simulado: <b>${(amountCents / 100).toFixed(2)} €</b>\n` +
      `POs creados: ${purchaseOrders.length} (${purchaseOrders.map((p) => p.supplier).join(", ")})\n` +
      `Email: ${emailResult.ok ? "✓" : "✗ " + (emailResult.error || "")}\n` +
      `Por: ${session.email}`,
    { parseMode: "HTML" },
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    cart: { id: cart.id, status: "ORDERED" },
    payment: { id: payment.id, amountCents, simulated: true },
    purchaseOrders: purchaseOrders.map((p) => ({
      id: p.id,
      supplier: p.supplier,
      status: p.status,
      totalClientCents: p.totalClientCents,
    })),
    facturascripts: fsResult,
    emailSent: emailResult.ok,
    note: "NO se ha enviado pedido a MidOcean. NO se ha cobrado nada. Cart en ORDERED con Payment PAID fake. Factura sí se ha creado en FacturaScripts (revisar campo `facturascripts`).",
  });
}
