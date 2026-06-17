import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lock atómico de cron vía AdminSetting. `create` con clave única → solo un
 * proceso gana; el resto ve la fila y aborta. Evita que ejecuciones SOLAPADAS
 * del mismo cron dupliquen efectos con efectos secundarios externos (emails al
 * cliente, entregas de webhook, filas en BD). TTL para auto-curar si un run
 * muere sin liberar. (bug-bounty 2026-06-17)
 *
 * Importante: el TTL debe ser MENOR que la cadencia del cron para no bloquear
 * la siguiente ejecución legítima (ej. webhook-retry corre cada 15 min → TTL 10).
 */
export async function acquireCronLock(key: string, ttlMs = 10 * 60 * 1000): Promise<boolean> {
  const lockKey = `cron_lock:${key}`;
  const now = Date.now();
  try {
    await prisma.adminSetting.create({ data: { key: lockKey, value: now } });
    return true;
  } catch {
    // Ya existe. Solo lo tomamos si el TTL expiró Y ganamos la carrera con un
    // update CONDICIONAL al valor viejo: es una sola sentencia UPDATE … WHERE,
    // atómica, así que si dos ejecuciones ven el lock caducado a la vez solo una
    // obtiene count===1. (endurecido bug-bounty 2026-06-17)
    const existing = await prisma.adminSetting.findUnique({
      where: { key: lockKey },
      select: { value: true },
    });
    const at = typeof existing?.value === "number" ? existing.value : 0;
    if (now - at <= ttlMs) return false; // lock aún vigente
    const claimed = await prisma.adminSetting.updateMany({
      where: { key: lockKey, value: { equals: at } },
      data: { value: now },
    });
    return claimed.count === 1;
  }
}

export async function releaseCronLock(key: string): Promise<void> {
  await prisma.adminSetting.delete({ where: { key: `cron_lock:${key}` } }).catch(() => {});
}

/**
 * Envuelve el cuerpo de un cron con el lock. Si ya hay una ejecución en curso,
 * responde 200 con skipped (no es un error: es la dedup funcionando). Libera el
 * lock en finally pase lo que pase.
 */
export async function withCronLock(
  key: string,
  fn: () => Promise<Response>,
  ttlMs?: number,
): Promise<Response> {
  if (!(await acquireCronLock(key, ttlMs))) {
    return NextResponse.json({ ok: true, skipped: `cron '${key}' ya en curso (lock activo)` });
  }
  try {
    return await fn();
  } finally {
    await releaseCronLock(key);
  }
}
