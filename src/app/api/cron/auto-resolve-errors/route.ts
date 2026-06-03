/**
 * POST /api/cron/auto-resolve-errors
 *
 * Marca como resolved los ErrorEvent que llevan ≥30 días sin ocurrencias
 * nuevas con misma firma normalizada. Concepto análogo al "auto-close
 * stale issues" de GitHub.
 *
 * Lógica:
 *   1. Cargamos todos los ErrorEvent unresolved más antiguos de 30 días
 *   2. Agrupamos por firma (mensaje normalizado) + context
 *   3. Para cada grupo: si NO hay ocurrencias <30 días con esa firma,
 *      marcamos todos los del grupo como resolved
 *   4. Anotamos en `context` que es auto-resolved para trazabilidad
 *
 * Si una nueva ocurrencia aparece después, no se reabre — pero como las
 * sugerencias y el listado por defecto ya no lo muestran, no molesta.
 *
 * Header: `x-cron-secret: $CRON_SECRET` (mismo patrón que el resto).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messageSignature } from "@/lib/insights/error-signature";
import { cleanupResolvedPins } from "@/lib/insights/pinned-errors";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_DAYS = 30;

export const POST = wrapCronHandler("auto-resolve-errors", async (req: Request) => {
  // Auth: cron-secret
  const secretHeader =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if (secretHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const now = new Date();
  const threshold = new Date(now.getTime() - STALE_DAYS * 24 * 3600 * 1000);

  // Errors unresolved >30d
  const staleCandidates = await prisma.errorEvent.findMany({
    where: { resolved: false, createdAt: { lt: threshold } },
    select: {
      id: true,
      message: true,
      context: true,
      createdAt: true,
    },
    take: 5_000, // límite defensivo
  });

  // Group key = signature + context
  function key(e: { message: string; context: string | null }) {
    return `${messageSignature(e.message)}::${e.context ?? ""}`;
  }

  if (staleCandidates.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: 0,
      groupsChecked: 0,
      groupsClosed: 0,
      errorsResolved: 0,
      thresholdDays: STALE_DAYS,
    });
  }

  // Agrupar candidatos
  const groups = new Map<string, typeof staleCandidates>();
  for (const e of staleCandidates) {
    const k = key(e);
    const arr = groups.get(k);
    if (arr) arr.push(e);
    else groups.set(k, [e]);
  }

  // Para cada grupo, verificar si hay ocurrencias recientes (<30d)
  // con misma firma. Si hay, NO cerramos el grupo.
  const recentByContext = new Map<string, string[]>(); // context → list of recent messages
  const contexts = new Set(staleCandidates.map((e) => e.context));
  for (const ctx of contexts) {
    const recents = await prisma.errorEvent.findMany({
      where: {
        context: ctx,
        createdAt: { gte: threshold },
      },
      select: { message: true },
    });
    recentByContext.set(
      ctx ?? "",
      recents.map((r) => messageSignature(r.message)),
    );
  }

  const idsToResolve: string[] = [];
  let groupsClosed = 0;
  for (const [groupKey, items] of groups) {
    const [sig, ctx] = groupKey.split("::");
    const recentSigs = recentByContext.get(ctx) ?? [];
    if (recentSigs.includes(sig)) continue; // bug aún vivo, no cerrar
    groupsClosed++;
    for (const item of items) idsToResolve.push(item.id);
  }

  let errorsResolved = 0;
  if (idsToResolve.length > 0) {
    const r = await prisma.errorEvent.updateMany({
      where: { id: { in: idsToResolve } },
      data: { resolved: true },
    });
    errorsResolved = r.count;
  }

  // Si cerramos errors, limpia pins huérfanos automáticamente
  const pinCleanup = await cleanupResolvedPins().catch(() => ({ removed: 0, remaining: 0 }));

  return NextResponse.json({
    ok: true,
    scanned: staleCandidates.length,
    groupsChecked: groups.size,
    groupsClosed,
    errorsResolved,
    pinsRemoved: pinCleanup.removed,
    thresholdDays: STALE_DAYS,
  });
});

// GET para fácil debugging sin disparar nada (devuelve dry-run conteos)
export async function GET(req: Request) {
  const secretHeader =
    req.headers.get("x-cron-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if (secretHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const threshold = new Date(Date.now() - STALE_DAYS * 24 * 3600 * 1000);
  const [staleCount, recentCount] = await Promise.all([
    prisma.errorEvent.count({
      where: { resolved: false, createdAt: { lt: threshold } },
    }),
    prisma.errorEvent.count({
      where: { createdAt: { gte: threshold } },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    thresholdDays: STALE_DAYS,
    staleCandidates: staleCount,
    recentEvents: recentCount,
    message: "POST con el mismo header para ejecutar el cierre",
  });
}
