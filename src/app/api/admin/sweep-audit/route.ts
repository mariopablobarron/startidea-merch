import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Audita qué productos están desactivados por el sweep (sin precio cerrado
 * o sin variants en el feed actual del supplier). Lista agrupada por supplier
 * con totales, para revisar manualmente cuáles podrían tener un fix vía PMM
 * (Product Master Manager) del supplier.
 *
 *   GET /api/admin/sweep-audit  → cookie admin
 */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const all = await prisma.product.findMany({
    where: {
      active: false,
      OR: [{ fromPriceCents: null }, { fromPriceCents: { lte: 0 } }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      supplier: true,
      supplierRef: true,
      internalRef: true,
      fromPriceCents: true,
      _count: { select: { variants: true } },
    },
    orderBy: [{ supplier: "asc" }, { slug: "asc" }],
  });

  const grouped = all.reduce<Record<string, typeof all>>((acc, p) => {
    (acc[p.supplier] ||= []).push(p);
    return acc;
  }, {});

  const summary = Object.entries(grouped).map(([supplier, products]) => ({
    supplier,
    total: products.length,
    withVariants: products.filter((p) => p._count.variants > 0).length,
    withoutVariants: products.filter((p) => p._count.variants === 0).length,
    sampleRefs: products.slice(0, 5).map((p) => p.supplierRef),
  }));

  return NextResponse.json({
    ok: true,
    total: all.length,
    summary,
    products: all.map((p) => ({
      slug: p.slug,
      supplier: p.supplier,
      supplierRef: p.supplierRef,
      internalRef: p.internalRef || null,
      name: p.name,
      fromPriceCents: p.fromPriceCents,
      variants: p._count.variants,
      catalogUrl: `https://merchandising.hubstartidea.es/catalogo/${p.slug}`,
    })),
  });
}
