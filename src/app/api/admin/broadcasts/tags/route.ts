import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { listSources } from "@/lib/broadcast-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/broadcasts/tags
 *
 * Devuelve los tags y los orígenes (source) disponibles en
 * NewsletterSubscriber con su conteo de subscribers activos. Para los
 * selectores del broadcast cuando audience=NEWSLETTER_TAG / NEWSLETTER_SOURCE.
 *
 * Solo cuenta subscribers `unsubscribedAt = NULL` (los que sí van a recibir).
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [rows, sources] = await Promise.all([
    prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
      SELECT unnest("tags") AS tag, COUNT(*) AS count
      FROM "NewsletterSubscriber"
      WHERE "unsubscribedAt" IS NULL
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `,
    listSources(),
  ]);

  return NextResponse.json({
    ok: true,
    tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
    sources,
  });
}
