import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check público. Para watchdog externo (UptimeRobot, BetterStack, etc.)
 * y para el monitor del propio VPS (`/usr/local/bin/merch-health.sh`).
 *
 * 200 si Postgres responde, 503 si no. No expone secretos.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message.slice(0, 120) : "db error";
  }
  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json(
    {
      ok: dbOk,
      service: "startidea-merch",
      checks: { db: dbOk ? "ok" : dbError },
      elapsedMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: dbOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}
