import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { midoceanOrders, type MidoceanCreateOrderPayload, type MidoceanOrderItem } from "@/lib/suppliers/midocean-orders";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crea pedido en MidOcean a partir de un CartQuote.
 *
 * Por defecto SIMULA (dry-run): devuelve el payload que se enviaría sin
 * hacer la llamada real. Para enviarlo de verdad: setear
 * MIDOCEAN_LIVE_ORDERS=true en el .env del proyecto.
 *
 * Una vez confirmado el pedido (live), guarda midoceanOrderId, payload y
 * respuesta en el CartQuote y cambia status a ORDERED.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  if (cart.midoceanOrderId) {
    return NextResponse.json(
      { error: "Carrito ya tiene un pedido MidOcean asignado", midoceanOrderId: cart.midoceanOrderId },
      { status: 409 },
    );
  }

  if (cart.items.length === 0) {
    return NextResponse.json({ error: "Carrito vacío" }, { status: 400 });
  }

  if (!cart.shippingAddress || !cart.shippingPostalCode || !cart.shippingCity) {
    return NextResponse.json(
      { error: "Falta dirección de envío. Edita el carrito antes de crear el pedido." },
      { status: 400 },
    );
  }

  const customerOrderRef = `merch-${cart.id.slice(0, 8)}`;

  const items: MidoceanOrderItem[] = cart.items.map((it) => {
    // Si hay logo subido por el cliente lo enviamos como print_artwork_url
    // absoluto, así MidOcean lo descarga y produce con el arte correcto
    // (sin necesidad de proof manual ni biblioteca de logotipos).
    let artworkUrl: string | undefined;
    if (it.customerLogoUrl) {
      artworkUrl = it.customerLogoUrl.startsWith("http")
        ? it.customerLogoUrl
        : `${SITE_URL}${it.customerLogoUrl}`;
    }
    return {
      master_code: it.productRef,
      sku: it.variantSku || it.productRef, // fallback al ref si no hay variante específica
      quantity: it.quantity,
      print_positions: it.markingTechniqueCode && it.markingPositionId
        ? [
            {
              position_id: it.markingPositionId,
              printing_technique: it.markingTechniqueCode,
              number_of_print_colors: it.markingColours ?? 1,
              ...(artworkUrl ? { print_artwork_url: artworkUrl } : {}),
            },
          ]
        : undefined,
    };
  });

  const payload: MidoceanCreateOrderPayload = {
    shipping_address: {
      company_name: cart.company || cart.name,
      contact_name: cart.name,
      street1: cart.shippingAddress,
      postal_code: cart.shippingPostalCode,
      city: cart.shippingCity,
      country: cart.shippingCountry || "ES",
      email: cart.email,
      phone: cart.phone || undefined,
      vat_number: cart.vatNumber || undefined,
    },
    customer_order_reference: customerOrderRef,
    remarks: cart.message || undefined,
    items,
  };

  const result = await midoceanOrders.createOrder(payload);

  if (result.dryRun) {
    // Persistimos snapshot del payload pero NO marcamos como ordered
    await prisma.cartQuote.update({
      where: { id: cart.id },
      data: {
        midoceanOrderPayload: payload as unknown as Prisma.InputJsonValue,
        midoceanCustomerOrderRef: customerOrderRef,
      },
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      reason: result.reason,
      payload,
      message: "Pedido NO enviado a MidOcean (simulación). Para enviar de verdad, setea MIDOCEAN_LIVE_ORDERS=true.",
    });
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: "MidOcean rechazó el pedido", status: result.status, detail: result.error },
      { status: 502 },
    );
  }

  await prisma.cartQuote.update({
    where: { id: cart.id },
    data: {
      midoceanOrderId: result.orderId,
      midoceanCustomerOrderRef: customerOrderRef,
      midoceanOrderPayload: payload as unknown as Prisma.InputJsonValue,
      midoceanOrderResponse: result.raw as Prisma.InputJsonValue,
      status: "ORDERED",
      orderedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, dryRun: false, orderId: result.orderId, raw: result.raw });
}
