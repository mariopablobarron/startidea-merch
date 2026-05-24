import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devuelve las opciones disponibles para los selectores de scope al crear
 * una promoción:
 *   - categories: top-level + sus hijas (id, name, full path)
 *   - brands:     valores distintos de Product.brand (activos)
 *   - tags:       valores distintos de ProductOverride.marketingTags
 *
 * Para PRODUCT_LIST no devolvemos productos completos — usa el endpoint
 * /api/admin/products?q= con autocompletar.
 */

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Categorías con path completo
  const categories = await prisma.category.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parent: { select: { name: true, parent: { select: { name: true } } } },
    },
  });
  const categoriesOut = categories.map((c) => {
    const path = [c.parent?.parent?.name, c.parent?.name, c.name].filter(Boolean).join(" › ");
    return { id: c.id, label: path };
  });

  // Brands distintas (Product.brand)
  const brandsRaw = await prisma.product.findMany({
    where: { active: true, brand: { not: null } },
    distinct: ["brand"],
    select: { brand: true },
    orderBy: { brand: "asc" },
  });
  const brands = brandsRaw.map((b) => b.brand!).filter(Boolean);

  // Tags marketing distintos (unnest del array marketingTags)
  // Postgres permite esto vía SQL crudo
  const tagsRaw = await prisma.$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT unnest("marketingTags") AS tag
    FROM "ProductOverride"
    WHERE array_length("marketingTags", 1) > 0
    ORDER BY tag
  `;
  const tags = tagsRaw.map((t) => t.tag);

  return NextResponse.json({
    ok: true,
    categories: categoriesOut,
    brands,
    tags,
  });
}
