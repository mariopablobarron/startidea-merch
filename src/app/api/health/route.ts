import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { warmEmbeddingCache } from "@/lib/embeddings";

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
  // Fire-and-forget: el ping (horario + healthcheck Docker cada pocos s)
  // mantiene caliente la caché de embeddings — ninguna búsqueda de David
  // paga la carga inicial. No afecta a la latencia ni al 200 del health.
  if (dbOk) warmEmbeddingCache(prisma);
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
