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
 *
 * Devuelve también `sha`: los 7 primeros del commit horneado en la imagen
 * (`ENV GIT_SHA`, ver Dockerfile y scripts/deploy.sh). Hasta ahora la ÚNICA
 * forma de saber qué código estaba vivo era `docker exec merch-app printenv
 * GIT_SHA` por SSH, y el SSH a la VPS se cae a ratos (anti-abuso de Hostinger):
 * cuando se cae, no hay manera de verificar un deploy, y "verificar el estado
 * real, no la ausencia de error" es justo lo que evita dar por bueno un deploy
 * que sirve código viejo (incidente del 2026-07-21). No es fingerprinting nuevo:
 * Next.js ya publica su BUILD_ID en las rutas de `/_next/static/`.
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
      sha: (process.env.GIT_SHA || "").slice(0, 7) || null,
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
