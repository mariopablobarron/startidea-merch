import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { requireCronSecret } from "@/lib/auth";
import { findCron } from "@/lib/cron-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * Dispatcher único para todos los crons. Acepta dos vías de auth:
 *   - Cookie de sesión admin (clicks desde /admin/system/crons)
 *   - X-Cron-Secret (cron del VPS via merch-cron-runner.sh)
 *
 * Llama internamente al endpoint /api/cron/<name> con CRON_SECRET y registra
 * la ejecución en CronRunLog (startedAt, finishedAt, ok, httpStatus, body, …).
 *
 * POST /api/admin/crons/trigger/<name>
 */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cron = findCron(name);
  if (!cron) return NextResponse.json({ error: `Cron desconocido: ${name}` }, { status: 404 });

  // Auth dual
  const cronAuth = requireCronSecret(req);
  const adminSession = cronAuth.ok ? null : await authenticateAdminRequest(req);
  if (!cronAuth.ok && !adminSession) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const triggeredBy = cronAuth.ok
    ? "cron"
    : adminSession
      ? `manual:${adminSession.email}`
      : "unknown";

  // Crear entrada CronRunLog antes de disparar
  const run = await prisma.cronRunLog.create({
    data: {
      name,
      triggeredBy,
    },
  });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    await prisma.cronRunLog.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, error: "CRON_SECRET no configurado" },
    });
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }

  const startTs = Date.now();
  let httpStatus = 0;
  let bodyText = "";
  let ok = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(`${SITE_URL}${cron.endpointPath}`, {
      method: cron.method,
      headers: { "X-Cron-Secret": cronSecret, "Content-Type": "application/json" },
    });
    httpStatus = res.status;
    bodyText = (await res.text()).slice(0, 1000);
    ok = res.ok;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startTs;
  await prisma.cronRunLog.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      ok,
      httpStatus: httpStatus || null,
      durationMs,
      response: bodyText || null,
      error: errorMsg,
    },
  });

  return NextResponse.json({
    ok,
    runId: run.id,
    httpStatus,
    durationMs,
    body: bodyText ? safeParse(bodyText) : null,
    error: errorMsg,
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s.slice(0, 500);
  }
}
