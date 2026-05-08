import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stock dashboard — productos agrupados por urgencia de reposición.
 *
 * Tiers:
 *   - SOLD_OUT  totalStock == 0
 *   - CRITICAL  0 < totalStock <= criticalThreshold (default 20)
 *   - LOW       criticalThreshold < totalStock <= lowThreshold (default 50)
 *   - STALE     no sync >7 días (sospechoso)
 *
 * Filter param: tier=sold_out|critical|low|stale|all
 * Solo productos active=true y NO hidden por override admin.
 */

type StockTier = "sold_out" | "critical" | "low" | "stale" | "all";

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const tier = (url.searchParams.get("tier") || "critical") as StockTier;
  const criticalThreshold = parseInt(url.searchParams.get("critical") || "20", 10);
  const lowThreshold = parseInt(url.searchParams.get("low") || "50", 10);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10));

  const staleSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Hacemos una sola query agregando stock por producto
  type Row = {
    id: string;
    slug: string;
    name: string;
    supplier_ref: string;
    primary_image_url: string | null;
    category_name: string | null;
    synced_at: Date;
    total_stock: bigint;
    variant_count: bigint;
    needs_restock_tag: boolean;
  };

  const safeQ = q.replace(/[^a-z0-9.@_\- ]/g, "");
  const filters: string[] = ['p."active" = TRUE'];
  // Excluir hidden por override admin
  filters.push("(o.\"hidden\" IS NULL OR o.\"hidden\" = FALSE)");
  if (q) {
    filters.push(`(LOWER(p."name") LIKE '%${safeQ}%' OR LOWER(p."supplierRef") LIKE '%${safeQ}%')`);
  }

  let havingClause = "";
  if (tier === "sold_out") {
    havingClause = "HAVING COALESCE(SUM(v.\"stockQty\"),0) = 0";
  } else if (tier === "critical") {
    havingClause = `HAVING COALESCE(SUM(v."stockQty"),0) > 0 AND COALESCE(SUM(v."stockQty"),0) <= ${criticalThreshold}`;
  } else if (tier === "low") {
    havingClause = `HAVING COALESCE(SUM(v."stockQty"),0) > ${criticalThreshold} AND COALESCE(SUM(v."stockQty"),0) <= ${lowThreshold}`;
  } else if (tier === "stale") {
    filters.push(`p."syncedAt" < '${staleSince.toISOString()}'`);
  }

  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      p."id",
      p."slug",
      p."name",
      p."supplierRef" AS supplier_ref,
      p."primaryImageUrl" AS primary_image_url,
      cat."name" AS category_name,
      p."syncedAt" AS synced_at,
      COALESCE(SUM(v."stockQty"),0)::BIGINT AS total_stock,
      COUNT(v."id")::BIGINT AS variant_count,
      ('needs-restock' = ANY(COALESCE(o."marketingTags", ARRAY[]::TEXT[]))) AS needs_restock_tag
    FROM "Product" p
    LEFT JOIN "ProductVariant" v ON v."productId" = p."id"
    LEFT JOIN "Category" cat ON cat."id" = p."categoryId"
    LEFT JOIN "ProductOverride" o ON o."productId" = p."id"
    WHERE ${filters.join(" AND ")}
    GROUP BY p."id", cat."name", o."marketingTags"
    ${havingClause}
    ORDER BY total_stock ASC, p."syncedAt" ASC
    LIMIT ${limit}
  `);

  // Counts por tier para los chips de filtro
  type CountRow = { tier: string; n: bigint };
  const counts = await prisma.$queryRawUnsafe<CountRow[]>(`
    SELECT
      CASE
        WHEN COALESCE(s.total,0) = 0 THEN 'sold_out'
        WHEN COALESCE(s.total,0) <= ${criticalThreshold} THEN 'critical'
        WHEN COALESCE(s.total,0) <= ${lowThreshold} THEN 'low'
        ELSE 'ok'
      END AS tier,
      COUNT(*)::BIGINT AS n
    FROM "Product" p
    LEFT JOIN (
      SELECT "productId", SUM("stockQty") AS total
      FROM "ProductVariant"
      GROUP BY "productId"
    ) s ON s."productId" = p."id"
    LEFT JOIN "ProductOverride" o ON o."productId" = p."id"
    WHERE p."active" = TRUE AND (o."hidden" IS NULL OR o."hidden" = FALSE)
    GROUP BY tier
  `);
  const staleCount = await prisma.product.count({
    where: { active: true, syncedAt: { lt: staleSince } },
  });

  const tierCounts: Record<string, number> = {
    sold_out: 0,
    critical: 0,
    low: 0,
    ok: 0,
    stale: staleCount,
  };
  for (const c of counts) tierCounts[c.tier] = Number(c.n);

  return NextResponse.json({
    ok: true,
    tier,
    thresholds: { critical: criticalThreshold, low: lowThreshold },
    counts: tierCounts,
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      supplierRef: r.supplier_ref,
      primaryImageUrl: r.primary_image_url,
      categoryName: r.category_name,
      syncedAt: r.synced_at,
      totalStock: Number(r.total_stock),
      variantCount: Number(r.variant_count),
      needsRestockTag: r.needs_restock_tag,
    })),
  });
}
