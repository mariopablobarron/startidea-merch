/**
 * POST /api/admin/insights/share-url
 *
 * Body: { scope: "summary" | "full", expiresInDays?: number }
 *
 * Genera URL firmada del dashboard read-only. Por defecto 30 días.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-session";
import { signShareToken } from "@/lib/dashboard-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

const BodySchema = z.object({
  scope: z.enum(["summary", "full"]).default("summary"),
  expiresInDays: z.number().int().min(1).max(180).default(30),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    body = BodySchema.parse({});
  }
  const token = signShareToken(body.scope, body.expiresInDays);
  return NextResponse.json({
    ok: true,
    url: `${SITE_URL}/share/dashboard/${token}`,
    scope: body.scope,
    expiresInDays: body.expiresInDays,
  });
}
