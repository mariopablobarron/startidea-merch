import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { authenticateCustomerRequest } from "@/lib/customer-auth";
import type { CartItem } from "@/lib/cart-storage";
import { resolveProductsBySlugs } from "@/lib/product-slug-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clientes/reorder  { cartId }
 *
 * "Repetir pedido" del portal cliente (equivalente al repeat-order de los
 * portales B2B de proveedor). Devuelve las líneas de un CartQuote pasado en el
 * shape de CartItem para que el navegador las cargue en el carrito local y
 * siga por el flujo normal de /cesta — así el precio se RECOTIZA con las
 * tarifas de hoy (tramos/promos actuales), no con las del pedido antiguo:
 * los totalClientCents antiguos NO se copian a propósito.
 *
 * Solo puede repetir carritos de su propio email (cookie de sesión).
 */
export async function POST(req: Request) {
  const session = await authenticateCustomerRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cartId = typeof (body as { cartId?: unknown })?.cartId === "string"
    ? (body as { cartId: string }).cartId
    : null;
  if (!cartId) return NextResponse.json({ error: "cartId requerido" }, { status: 400 });

  const cart = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    include: {
      items: { include: { markings: { orderBy: { order: "asc" } } } },
    },
  });
  if (!cart) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (cart.email.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Solo líneas cuyo producto siga ACTIVO en catálogo; las retiradas se
  // devuelven aparte para avisar al cliente en vez de fallar en silencio.
  const slugs = [...new Set(cart.items.map((it) => it.productSlug))];
  const activeProducts = await resolveProductsBySlugs(slugs, (candidateSlugs) =>
    prisma.product.findMany({
      where: { slug: { in: [...candidateSlugs] }, active: true },
      select: { slug: true },
    }),
  );

  const items: CartItem[] = [];
  const unavailable: string[] = [];
  for (const it of cart.items) {
    const resolved = activeProducts.get(it.productSlug);
    if (!resolved) {
      unavailable.push(it.productName);
      continue;
    }
    const markings = it.markings.map((m) => ({
      positionId: m.positionId,
      positionLabel: m.positionLabel,
      techniqueCode: m.techniqueCode,
      techniqueName: m.techniqueName,
      numberOfColors: m.numberOfColors,
      manipulationCode: m.manipulationCode,
      printAreaCm2: m.printAreaCm2,
      notes: m.notes,
    }));
    const first = markings[0];
    items.push({
      productSlug: resolved.canonicalSlug,
      productRef: it.productRef,
      productName: it.productName,
      primaryImageUrl: proxyImageUrl(it.primaryImageUrl), // nunca URL cruda de proveedor
      quantity: it.quantity,
      variantSku: it.variantSku,
      colorName: it.colorName,
      markingTechniqueCode: first?.techniqueCode ?? null,
      markingTechniqueName: first?.techniqueName ?? null,
      markingPositionId: first?.positionId ?? null,
      markingColours: first?.numberOfColors ?? null,
      markingComplexity: first?.manipulationCode ?? null,
      markings: markings.length > 0 ? markings : undefined,
      // Sin precios: /cesta recotiza con las tarifas vigentes.
      notes: it.notes,
      customerLogoUrl: it.customerLogoUrl,
      customerLogoFilename: it.customerLogoFilename,
      customerLogoSize: it.customerLogoSize,
    });
  }

  return NextResponse.json({ ok: true, items, unavailable });
}
