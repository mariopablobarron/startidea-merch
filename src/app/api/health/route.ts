import os from "node:os";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { warmEmbeddingCache } from "@/lib/embeddings";
import { requireCronSecret } from "@/lib/auth";

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
 *
 * Por el MISMO motivo devuelve `host` (carga del anfitrión), pero SOLO a quien
 * presenta el `x-cron-secret`: la regla de despliegue exige no construir con
 * `load1 > 12` —encadenar builds ya tumbó la VPS (2026-06-21 y 2026-07-01)— y
 * hasta ahora la única forma de leer esa carga era `uptime` por SSH. Cuando el
 * SSH se cae, la elección era desplegar a ciegas o no desplegar. Va gateado
 * porque la carga de un anfitrión es justo el dato con el que se elige el
 * momento de golpear un servicio; el `sha` y el `db` siguen siendo públicos
 * para el watchdog. `os.loadavg()` dentro del contenedor lee /proc/loadavg del
 * anfitrión (kernel compartido), que es precisamente lo que se quiere medir.
 */
export async function GET(req: Request) {
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
  // Nunca cambia el status ni el resto del cuerpo: un secret ausente o malo
  // deja la respuesta pública exactamente como estaba (el watchdog no lo lleva).
  const [load1, load5, load15] = os.loadavg();
  const host = requireCronSecret(req).ok
    ? {
        host: {
          load1: Math.round(load1 * 100) / 100,
          load5: Math.round(load5 * 100) / 100,
          load15: Math.round(load15 * 100) / 100,
          cpus: os.cpus().length,
        },
      }
    : {};
  return NextResponse.json(
    {
      ok: dbOk,
      service: "startidea-merch",
      sha: (process.env.GIT_SHA || "").slice(0, 7) || null,
      checks: { db: dbOk ? "ok" : dbError },
      ...host,
      elapsedMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: dbOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}
