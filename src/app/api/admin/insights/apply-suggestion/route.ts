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

type ActionResult = { message: string; redirect?: string };

async function runAction(
  actionId: string,
  payload: Record<string, unknown> | undefined,
): Promise<ActionResult> {
  switch (actionId) {
    case "deactivate_expired_promotions": {
      const result = await prisma.promotion.updateMany({
        where: { active: true, endsAt: { lt: new Date() } },
        data: { active: false },
      });
      return {
        message: `${result.count} promoción(es) desactivada(s)`,
        redirect: "/admin/promotions",
      };
    }
    case "open_create_alias": {
      const q = typeof payload?.query === "string" ? payload.query : "";
      return {
        message: "Abriendo editor de alias…",
        redirect: `/admin/insights/search-aliases?prefill=${encodeURIComponent(q)}`,
      };
    }
    case "clear_resolved_errors": {
      const r = await prisma.errorEvent.deleteMany({ where: { resolved: true } });
      return { message: `${r.count} errores resueltos eliminados` };
    }
    case "snooze_suggestion": {
      const id = typeof payload?.suggestionId === "string" ? payload.suggestionId : "";
      const days = typeof payload?.days === "number" ? payload.days : 7;
      if (!id) throw new Error("MISSING_SUGGESTION_ID");
      const until = new Date(Date.now() + days * 24 * 3600_000);
      await prisma.suggestionSnooze.upsert({
        where: { suggestionId: id },
        create: { suggestionId: id, snoozedUntil: until },
        update: { snoozedUntil: until },
      });
      return { message: `Sugerencia silenciada ${days} días` };
    }
    case "unsnooze_all": {
      const r = await prisma.suggestionSnooze.deleteMany({});
      return { message: `${r.count} snooze(s) cancelado(s)` };
    }
    default:
      throw new Error("UNKNOWN_ACTION");
  }
}

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

  try {
    const result = await runAction(body.actionId, body.payload);
    // Log fire-and-forget
    void prisma.suggestionActionLog
      .create({
        data: {
          actionId: body.actionId,
          payload: body.payload as object | undefined,
          result: result as unknown as object,
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    if (message === "UNKNOWN_ACTION") {
      return NextResponse.json(
        { error: "UNKNOWN_ACTION", actionId: body.actionId },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "EXEC_FAILED", message }, { status: 500 });
  }
}
