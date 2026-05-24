import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spell C1 — Backend del Cmd+K palette admin.
 *
 * Devuelve resultados agrupados por tipo: productos, promos, pedidos,
 * clientes. Cada uno con un href para navegar al detalle.
 *
 * GET /api/admin/search?q=<query>&limit=<n>
 *
 * Diseño:
 * - Una query corta debe sentirse instantánea (<150ms)
 * - Cap pequeño por tipo (default 5) para que el modal no se desborde
 * - Si q vacío → devuelve "atajos" sugeridos (productos editados recientemente,
 *   promos activas) para que el palette no esté vacío al abrir
 */

const TYPE_LIMIT = 5;
const TYPE_LIMIT_EMPTY = 6;

type Result = {
  type: "product" | "promotion" | "order" | "customer" | "shortcut";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  hint?: string; // pequeño tag a la derecha (estado, precio…)
};

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) return NextResponse.json({ ok: true, results: await emptyShortcuts() });

  const limit = Math.min(
    20,
    parseInt(url.searchParams.get("limit") || String(TYPE_LIMIT), 10) || TYPE_LIMIT,
  );

  // Productos: nombre, internalRef o supplierRef
  const productsP = prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { internalRef: { contains: q, mode: "insensitive" } },
        { supplierRef: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      internalRef: true,
      slug: true,
      fromPriceCents: true,
      override: { select: { customName: true } },
    },
  });

  // Promociones: nombre, slug
  const promosP = prisma.promotion.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { startsAt: "desc" },
    select: { id: true, name: true, slug: true, active: true, kind: true, value: true },
  });

  // Pedidos: id corto, email cliente, nombre cliente
  const ordersP = prisma.cartQuote
    .findMany({
      where: {
        OR: [
          { id: { contains: q.toLowerCase() } },
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        estimatedTotalCents: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  const [products, promos, orders] = await Promise.all([productsP, promosP, ordersP]);

  const results: Result[] = [];

  for (const p of products) {
    const displayName = p.override?.customName || p.name;
    results.push({
      type: "product",
      id: p.id,
      title: displayName,
      subtitle: p.internalRef || p.slug,
      href: `/admin/products/${p.id}`,
      hint:
        p.fromPriceCents && p.fromPriceCents > 0
          ? `desde ${(p.fromPriceCents / 100).toFixed(2).replace(".", ",")} €`
          : undefined,
    });
  }
  for (const p of promos) {
    results.push({
      type: "promotion",
      id: p.id,
      title: p.name,
      subtitle: `/${p.slug}`,
      href: `/admin/promotions`,
      hint:
        (p.active ? "" : "(pausada) ") +
        (p.kind === "PERCENT" ? `−${p.value}%` : `−${(p.value / 100).toFixed(0)}€`),
    });
  }
  for (const o of orders) {
    results.push({
      type: "order",
      id: o.id,
      title: o.name || o.email || o.id.slice(0, 8),
      subtitle: o.email,
      href: `/admin/cart-quotes/${o.id}`,
      hint:
        (o.status as string) +
        (o.estimatedTotalCents
          ? ` · ${(o.estimatedTotalCents / 100).toFixed(0)}€`
          : ""),
    });
  }

  return NextResponse.json({ ok: true, results });
}

async function emptyShortcuts(): Promise<Result[]> {
  // Sin query → mostramos atajos contextuales útiles
  const [promosActive, productsFeatured, recentOrders] = await Promise.all([
    prisma.promotion.findMany({
      where: { active: true },
      take: 3,
      orderBy: { startsAt: "desc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.product.findMany({
      where: { override: { is: { featured: true } } },
      take: 3,
      orderBy: { name: "asc" },
      select: { id: true, name: true, internalRef: true, slug: true },
    }),
    prisma.cartQuote
      .findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, status: true },
      })
      .catch(() => []),
  ]);

  const out: Result[] = [];

  // Páginas frecuentes primero
  out.push(
    {
      type: "shortcut",
      id: "nav:products",
      title: "Productos",
      href: "/admin/products",
      hint: "↵",
    },
    {
      type: "shortcut",
      id: "nav:promotions",
      title: "Promociones",
      href: "/admin/promotions",
      hint: "↵",
    },
    {
      type: "shortcut",
      id: "nav:cart-quotes",
      title: "Carritos / cotizaciones",
      href: "/admin/cart-quotes",
      hint: "↵",
    },
    {
      type: "shortcut",
      id: "nav:orders",
      title: "Pedidos",
      href: "/admin/orders",
      hint: "↵",
    },
  );

  for (const p of promosActive) {
    out.push({
      type: "promotion",
      id: p.id,
      title: p.name,
      subtitle: `/${p.slug}`,
      href: `/admin/promotions`,
      hint: "activa",
    });
  }
  for (const p of productsFeatured) {
    out.push({
      type: "product",
      id: p.id,
      title: p.name,
      subtitle: p.internalRef || p.slug,
      href: `/admin/products/${p.id}`,
      hint: "destacado",
    });
  }
  for (const o of recentOrders) {
    out.push({
      type: "order",
      id: o.id,
      title: o.name || o.email || o.id.slice(0, 8),
      subtitle: o.email,
      href: `/admin/cart-quotes/${o.id}`,
      hint: (o.status as string).toLowerCase(),
    });
  }

  return out;
}
