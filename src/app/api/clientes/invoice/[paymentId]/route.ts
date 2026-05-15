import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCustomerRequest } from "@/lib/customer-auth";
import { generateInvoicePdfBuffer, type InvoiceData } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_VAT_RATE = 0.21; // 21% España general

/**
 * Genera (o devuelve cacheada) la factura PDF de un Payment del cliente
 * autenticado.
 *
 * Política:
 *  - Solo Payment.status=PAID puede facturarse.
 *  - Si no tiene invoiceNumber asignado: se le asigna AUTOincremental
 *    para el año actual (formato YYYY-NNNN) y se guarda + invoiceIssuedAt.
 *  - Una vez emitida, número y fecha son inmutables (cumple normativa).
 *  - El PDF se regenera on-demand (no se almacena el blob; solo metadatos).
 *  - Solo accede el cliente cuyo email coincide con el cart.email.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const session = await authenticateCustomerRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { paymentId } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      cart: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (payment.cart.email.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (payment.status !== "PAID") {
    return NextResponse.json(
      { error: "Solo se facturan pagos completados" },
      { status: 409 },
    );
  }

  // Asignar número correlativo si no lo tiene
  let invoiceNumber = payment.invoiceNumber;
  let issuedAt = payment.invoiceIssuedAt;
  if (!invoiceNumber || !issuedAt) {
    const year = new Date().getFullYear();
    const lastInYear = await prisma.payment.findFirst({
      where: { invoiceNumber: { startsWith: `${year}-` } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const lastSeq = lastInYear?.invoiceNumber
      ? parseInt(lastInYear.invoiceNumber.split("-")[1], 10) || 0
      : 0;
    const nextSeq = lastSeq + 1;
    invoiceNumber = `${year}-${String(nextSeq).padStart(4, "0")}`;
    issuedAt = new Date();
    await prisma.payment.update({
      where: { id: payment.id },
      data: { invoiceNumber, invoiceIssuedAt: issuedAt },
    });
  }

  // Construir datos factura: el amountCents pagado YA incluye IVA (Stripe).
  // Calculamos base imponible y cuota IVA al revés.
  const totalCents = payment.amountCents;
  const baseCents = Math.round(totalCents / (1 + DEFAULT_VAT_RATE));
  const vatCents = totalCents - baseCents;

  // Items: si todos los CartQuoteItem tienen totalClientCents, los proporcionamos
  // como descripción. Si no, usamos un único concepto agregado.
  const itemsHaveAllPrices = payment.cart.items.every((it) => it.totalClientCents != null);
  let pdfItems: InvoiceData["items"];
  if (itemsHaveAllPrices) {
    // Convertir totales con IVA → sin IVA proporcionalmente
    const factor = baseCents / totalCents;
    pdfItems = payment.cart.items.map((it) => {
      const itemTotalWithVat = it.totalClientCents ?? 0;
      const itemTotalNoVat = Math.round(itemTotalWithVat * factor);
      const itemUnitNoVat = Math.round(itemTotalNoVat / Math.max(1, it.quantity));
      const markingDesc =
        it.markingTechniqueName && it.markingPositionId
          ? ` · ${it.markingTechniqueName} en ${it.markingPositionId}${it.markingColours && it.markingColours > 1 ? ` (${it.markingColours} col.)` : ""}`
          : "";
      return {
        description: `${it.productName} (${it.productRef})${markingDesc}`,
        quantity: it.quantity,
        unitPriceCents: itemUnitNoVat,
        totalCents: itemTotalNoVat,
      };
    });
  } else {
    pdfItems = [
      {
        description: `Merchandising corporativo personalizado · pedido ${payment.cart.id.slice(0, 8)}`,
        quantity: 1,
        unitPriceCents: baseCents,
        totalCents: baseCents,
      },
    ];
  }

  const data: InvoiceData = {
    invoiceNumber,
    issuedAt,
    customer: {
      name: payment.cart.name,
      company: payment.cart.company,
      vatNumber: payment.cart.vatNumber,
      address: payment.cart.shippingAddress,
      postalCode: payment.cart.shippingPostalCode,
      city: payment.cart.shippingCity,
      country: payment.cart.shippingCountry,
      email: payment.cart.email,
    },
    paymentMethod: paymentMethodLabel(payment.kind, payment.stripeMode),
    paymentDate: payment.paidAt ?? issuedAt,
    items: pdfItems,
    baseCents,
    vatRate: DEFAULT_VAT_RATE,
    vatCents,
    totalCents,
  };

  const pdfBuffer = await generateInvoicePdfBuffer(data);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="factura-${invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function paymentMethodLabel(kind: string, mode: string | null): string {
  const base = "Tarjeta vía Stripe";
  if (kind === "DEPOSIT") return `${base} (depósito)`;
  if (mode === "test") return `${base} (modo prueba)`;
  return base;
}
