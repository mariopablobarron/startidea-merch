import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { authenticateApiKey, requireScope } from "@/lib/api-auth";
import { notifyAdmins } from "@/lib/notify-admin";
import { publicProductName } from "@/lib/product-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ItemSchema = z.object({
  ref: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  variantSku: z.string().optional(),
  marking: z
    .object({
      position: z.string().optional(),
      technique: z.string().optional(),
      colours: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
  notes: z.string().max(500).optional(),
});

const QuoteSchema = z.object({
  contact: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    company: z.string().max(160).optional(),
    phone: z.string().max(40).optional(),
  }),
  shipping: z
    .object({
      address: z.string().max(200).optional(),
      postalCode: z.string().max(20).optional(),
      city: z.string().max(100).optional(),
      country: z.string().length(2).optional(),
      vatNumber: z.string().max(40).optional(),
    })
    .optional(),
  brief: z.string().max(4000).optional(),
  deadline: z.string().max(120).optional(),
  items: z.array(ItemSchema).min(1).max(50),
});

/**
 * POST /api/v1/quotes
 * Crea una cotización en nombre de un cliente corporativo.
 * Devuelve el id interno + URL al cliente para revisar la propuesta cuando
 * el equipo la procese.
 */
export async function POST(req: Request) {
  let auth = await authenticateApiKey(req);
  auth = requireScope(auth, "write:quote");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Resolver productos a partir de los refs públicas (STM-XXX).
  // NUNCA exponemos supplierRef al cliente externo — el match se hace
  // por internalRef. Si un producto no tiene internalRef todavía
  // (backfill pendiente), no se podrá referenciar por API hasta el
  // próximo sync. Esto es intencional para no filtrar el sourcing.
  const products = await prisma.product.findMany({
    where: { internalRef: { in: data.items.map((it) => it.ref) }, active: true },
    select: {
      internalRef: true,
      slug: true,
      name: true,
      primaryImageUrl: true,
      override: { select: { customName: true } },
    },
  });
  const byRef = new Map(products.map((p) => [p.internalRef!, p]));
  const unknown = data.items.filter((it) => !byRef.has(it.ref));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: "Refs no encontradas en catálogo", unknown: unknown.map((u) => u.ref) },
      { status: 422 },
    );
  }

  const cart = await prisma.cartQuote.create({
    data: {
      name: data.contact.name,
      company: data.contact.company,
      email: data.contact.email,
      phone: data.contact.phone,
      shippingAddress: data.shipping?.address,
      shippingPostalCode: data.shipping?.postalCode,
      shippingCity: data.shipping?.city,
      shippingCountry: data.shipping?.country || "ES",
      vatNumber: data.shipping?.vatNumber,
      message: data.brief,
      deadline: data.deadline,
      source: "api-v1",
      items: {
        create: data.items.map((it) => {
          const p = byRef.get(it.ref)!;
          return {
            productSlug: p.slug,
            productRef: it.ref,
            productName: publicProductName(p.name, p.override?.customName),
            primaryImageUrl: proxyImageUrl(p.primaryImageUrl), // guardar proxy, nunca crudo
            quantity: it.quantity,
            variantSku: it.variantSku,
            markingPositionId: it.marking?.position,
            markingTechniqueCode: it.marking?.technique,
            markingColours: it.marking?.colours,
            notes: it.notes,
          };
        }),
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });

  void notifyAdmins({
    title: `Nueva cotización API · ${data.contact.name}`,
    body: `${cart.items.length} producto${cart.items.length === 1 ? "" : "s"}${data.contact.company ? ` · ${data.contact.company}` : ""}`,
    url: `/admin/cart-quotes/${cart.id}`,
    tag: `api-${cart.id}`,
    requireInteraction: true,
  }).catch(() => {});

  return NextResponse.json(
    {
      id: cart.id,
      itemsCount: cart.items.length,
      message:
        "Cotización recibida. Si configuraste cantidad y marcaje, el precio ya está calculado en cada item. Para condiciones especiales o mockup técnico, te respondemos en menos de 24h laborables.",
    },
    { status: 201 },
  );
}
