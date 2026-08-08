import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";
import { midoceanOrders, type MidoceanCreateOrderPayload, type MidoceanOrderItem } from "@/lib/suppliers/midocean-orders";
import { claimSupplierOrder, releaseSupplierOrderClaim } from "@/lib/supplier-order-claim";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

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
  // Pedido REAL al proveedor (con MIDOCEAN_LIVE_ORDERS=true): solo CEO u
  // OPERACIONES — el rol COMERCIAL no debe poder comprometer compras.
  const auth = await requireRole(req, "OPERACIONES");
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

  // Mismo cerrojo que usa el pedido automático del webhook de Stripe, y con la
  // MISMA clave a propósito: el peligro no es pulsar el botón dos veces, es
  // pulsarlo mientras el webhook ya está cursando el pedido por su cuenta. El
  // `midoceanOrderId` que se comprueba arriba no se escribe hasta DESPUÉS de
  // hablar con el proveedor, así que solo un cerrojo compartido cierra esa
  // ventana. Se reclama aquí, pegado a la llamada, para no tener que soltarlo
  // en cada validación previa; a partir de este punto no se suelta (ver
  // supplier-order-claim.ts: "como mucho una vez").
  if (!(await claimSupplierOrder("midocean", cart.id))) {
    return NextResponse.json(
      { error: "Este carrito se está cursando ahora mismo. Espera unos segundos y recarga antes de reintentar." },
      { status: 409 },
    );
  }

  const result = await midoceanOrders.createOrder(payload);

  if (result.dryRun) {
    // Simulación: no se ha llegado a hablar con el proveedor, así que se
    // suelta el cerrojo en vez de dejar el carrito bloqueado una hora.
    await releaseSupplierOrderClaim("midocean", cart.id);
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
