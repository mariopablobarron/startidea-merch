import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { CRON_CATALOG } from "@/lib/cron-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/crons → catálogo + último run + 5 últimos runs por cron.
 * Devuelve también un status calculado (OK / STALE / NEVER / RUNNING) basado
 * en último run + frecuencia esperada.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const out = await Promise.all(
    CRON_CATALOG.map(async (cron) => {
      const lastRuns = await prisma.cronRunLog.findMany({
        where: { name: cron.name },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
          ok: true,
          httpStatus: true,
          durationMs: true,
          response: true,
          error: true,
          triggeredBy: true,
        },
      });
      const last = lastRuns[0] ?? null;

      let status: "OK" | "STALE" | "NEVER" | "RUNNING" | "FAILED" = "NEVER";
      if (last) {
        if (!last.finishedAt) status = "RUNNING";
        else if (!last.ok) status = "FAILED";
        else {
          const hours = (Date.now() - last.startedAt.getTime()) / 3_600_000;
          status = hours <= cron.frequencyHours * 1.5 ? "OK" : "STALE";
        }
      }

      return {
        ...cron,
        status,
        last,
        lastRuns,
      };
    }),
  );

  return NextResponse.json({ crons: out, generatedAt: new Date().toISOString() });
}
