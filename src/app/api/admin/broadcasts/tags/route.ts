import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/broadcasts/tags
 *
 * Devuelve los tags disponibles en NewsletterSubscriber con su conteo de
 * subscribers activos. Para el selector multi-tag del broadcast cuando
 * audience=NEWSLETTER_TAG.
 *
 * Solo cuenta subscribers `unsubscribedAt = NULL` (los que sí van a recibir).
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
    SELECT unnest("tags") AS tag, COUNT(*) AS count
    FROM "NewsletterSubscriber"
    WHERE "unsubscribedAt" IS NULL
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `;

  return NextResponse.json({
    ok: true,
    tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
  });
}
