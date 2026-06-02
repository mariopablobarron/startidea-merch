/**
 * POST /api/admin/insights/apply-suggestion
 *
 * Body: { actionId: string, payload?: Record<string, unknown> }
 *
 * Ejecuta acciones one-click derivadas de las sugerencias del dashboard.
 * Cada actionId tiene su handler. Si no encuentra → 400.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  actionId: z.string().min(1).max(50),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  switch (body.actionId) {
    case "deactivate_expired_promotions": {
      const result = await prisma.promotion.updateMany({
        where: { active: true, endsAt: { lt: new Date() } },
        data: { active: false },
      });
      return NextResponse.json({
        ok: true,
        message: `${result.count} promoción(es) desactivada(s)`,
        redirect: "/admin/promotions",
      });
    }
    case "open_create_alias": {
      const q = typeof body.payload?.query === "string" ? body.payload.query : "";
      const url = `/admin/insights/search-aliases?prefill=${encodeURIComponent(q)}`;
      return NextResponse.json({
        ok: true,
        redirect: url,
        message: "Abriendo editor de alias…",
      });
    }
    case "clear_resolved_errors": {
      const r = await prisma.errorEvent.deleteMany({ where: { resolved: true } });
      return NextResponse.json({
        ok: true,
        message: `${r.count} errores resueltos eliminados`,
      });
    }
    default:
      return NextResponse.json(
        { error: "UNKNOWN_ACTION", actionId: body.actionId },
        { status: 400 },
      );
  }
}
