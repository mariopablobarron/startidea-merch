import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista de clientes agregada por email único — combina CartQuote, CustomerUser,
 * Payment y CustomerProfile en una vista única.
 *
 * Query params:
 *   q       búsqueda en email/name/company
 *   segment filtro por segmento
 *   sort    ltv | recent | name (default ltv)
 *   page, perPage (default 50)
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const segment = url.searchParams.get("segment") || "";
  const sort = url.searchParams.get("sort") || "ltv";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(100, parseInt(url.searchParams.get("perPage") || "50", 10));

  // Agregamos por email vía groupBy CartQuote + merge con CustomerUser + Profile
  // Estrategia: un raw query nos da el agregado completo en una sola operación.
  const filters: string[] = ['c."email" != \'\''];
  if (q) {
    const safeQ = q.replace(/[^a-z0-9.@_\- ]/g, "");
    filters.push(`(LOWER(c."email") LIKE '%${safeQ}%' OR LOWER(c."name") LIKE '%${safeQ}%' OR LOWER(COALESCE(c."company",'')) LIKE '%${safeQ}%')`);
  }
  if (segment) {
    filters.push(`p."segment" = '${segment.replace(/[^A-Z_]/g, "")}'`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const orderBy =
    sort === "recent"
      ? `MAX(c."createdAt") DESC`
      : sort === "name"
        ? `MIN(c."name") ASC`
        : `COALESCE(SUM(CASE WHEN pay."status"='PAID' THEN pay."amountCents" ELSE 0 END),0) DESC`;

  type Row = {
    email: string;
    name: string;
    company: string | null;
    cart_count: bigint;
    paid_count: bigint;
    ltv_cents: bigint;
    last_cart_at: Date | null;
    last_paid_at: Date | null;
    has_user: boolean;
    tags: string[] | null;
    segment: string | null;
  };

  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      LOWER(c."email") AS email,
      MIN(c."name") AS name,
      MIN(c."company") AS company,
      COUNT(DISTINCT c."id")::BIGINT AS cart_count,
      COUNT(DISTINCT CASE WHEN pay."status"='PAID' THEN pay."id" END)::BIGINT AS paid_count,
      COALESCE(SUM(CASE WHEN pay."status"='PAID' THEN pay."amountCents" ELSE 0 END),0)::BIGINT AS ltv_cents,
      MAX(c."createdAt") AS last_cart_at,
      MAX(CASE WHEN pay."status"='PAID' THEN pay."paidAt" END) AS last_paid_at,
      (cu."id" IS NOT NULL) AS has_user,
      p."tags" AS tags,
      p."segment" AS segment
    FROM "CartQuote" c
    LEFT JOIN "Payment" pay ON pay."cartId" = c."id"
    LEFT JOIN "CustomerUser" cu ON LOWER(cu."email") = LOWER(c."email")
    LEFT JOIN "CustomerProfile" p ON LOWER(p."email") = LOWER(c."email")
    ${where}
    GROUP BY LOWER(c."email"), cu."id", p."tags", p."segment"
    ORDER BY ${orderBy}
    LIMIT ${perPage}
    OFFSET ${(page - 1) * perPage}
  `);

  // Total para paginación
  const totalRow = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(`
    SELECT COUNT(DISTINCT LOWER(c."email"))::BIGINT AS total
    FROM "CartQuote" c
    LEFT JOIN "CustomerProfile" p ON LOWER(p."email") = LOWER(c."email")
    ${where}
  `);
  const total = Number(totalRow[0]?.total ?? 0);

  return NextResponse.json({
    ok: true,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    items: rows.map((r) => ({
      email: r.email,
      name: r.name,
      company: r.company,
      cartCount: Number(r.cart_count),
      paidCount: Number(r.paid_count),
      ltvCents: Number(r.ltv_cents),
      lastCartAt: r.last_cart_at,
      lastPaidAt: r.last_paid_at,
      hasUser: r.has_user,
      tags: r.tags ?? [],
      segment: r.segment,
    })),
  });
}
