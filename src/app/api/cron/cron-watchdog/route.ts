/**
 * POST /api/cron/cron-watchdog
 *
 * Recorre todos los crons trackeados (via listCronNames) y avisa
 * si alguno lleva más de `expectedHours` sin ejecutarse o tuvo
 * fallo en su última run.
 *
 * Programado: diario 11:00 UTC (después de ai-usage-alert).
 *
 * Umbral por cron name (configuración hardcoded — pocos crons,
 * cambia rara vez; si crece, mover a AdminSetting).
 *
 * Solo se vigila el silencio de los crons que algo dispara de verdad: uno sin
 * disparador nunca dejará de estar callado, y esa falsa alarma permanente es
 * ruido que tapa los avisos que sí importan (ver @/lib/cron-staleness).
 *
 * Anti-spam: avisa si la lista de problemas cambia respecto a la última avisada
 * y, si no cambia, la recuerda cada REALERT_AFTER_HOURS — callarse ante un
 * problema abierto es peor que repetirse. Estado en AdminSetting
 * `cron_watchdog_last_alert` = { names, at }.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import {
  listCronNames,
  getCronHistory,
  wrapCronHandler,
} from "@/lib/cron-tracking";
import { CRON_CATALOG } from "@/lib/cron-catalog";
import {
  detectStalledSyncs,
  stalledIssueName,
  STALLED_AFTER_HOURS,
} from "@/lib/suppliers/stalled-sync";
import {
  expectedHoursFor,
  silenceWatchability,
  sortBySeverity,
  decideWatchdogAlert,
  parseWatchdogAlertState,
  CRITICAL_CRONS,
} from "@/lib/cron-staleness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El umbral de silencio por cron vive en @/lib/cron-staleness (expectedHoursFor),
// para poder testearlo aislado (un route.ts no puede exportar helpers: Next.js
// rechaza cualquier export que no sea un handler HTTP o config de ruta).

export const POST = wrapCronHandler("cron-watchdog", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const names = await listCronNames();
  // Red de seguridad: un cron del catálogo (CRON_CATALOG) que nunca ha
  // ejecutado ni una sola vez no tiene key `cron_runs_*` en AdminSetting, así
  // que listCronNames() no lo ve — sería invisible para este watchdog. Unimos
  // con los nombres del catálogo para que también cuente como candidato.
  const trackedSet = new Set(names);
  const catalogNames = CRON_CATALOG.map((c) => c.name);
  const allNames = Array.from(new Set([...names, ...catalogNames]));
  // Excluir self del check para no notificarnos a nosotros mismos
  const others = allNames.filter((n) => n !== "cron-watchdog");

  type Status = {
    name: string;
    expectedHours: number;
    lastRunAt: string | null;
    hoursSinceLastRun: number | null;
    lastOk: boolean | null;
    silent: boolean; // sin runs en mucho tiempo
    failingLast: boolean; // última run fue fallo
    unwatchedReason?: string; // por qué su silencio no se vigila (si aplica)
  };

  const statuses: Status[] = await Promise.all(
    others.map(async (name) => {
      const runs = await getCronHistory(name);
      const last = runs[0];
      const expectedHours = expectedHoursFor(name);
      // Un cron sin disparador (o disparado fuera de la ruta HTTP, como el
      // backup que hace el bash del host) está silencioso POR DISEÑO: avisar de
      // él es una falsa alarma que nadie puede cerrar. Se sigue viendo en el
      // panel; simplemente no genera aviso por silencio.
      const watch = silenceWatchability(name);
      if (!watch.watchable) {
        const hours = last
          ? (Date.now() - new Date(last.at).getTime()) / 3_600_000
          : null;
        return {
          name,
          expectedHours,
          lastRunAt: last?.at ?? null,
          hoursSinceLastRun: hours === null ? null : Math.round(hours * 10) / 10,
          lastOk: last?.ok ?? null,
          silent: false,
          // Un fallo real al ejecutarse sí sigue avisando: lo que se ignora es
          // el silencio, no los errores.
          failingLast: last ? !last.ok : false,
          unwatchedReason: watch.reason,
        };
      }
      if (!last) {
        // Sin historia: si venía de listCronNames (tiene key cron_runs_* pero
        // por lo que sea la lista está vacía) es un caso "nuevo", no
        // silencioso. Si SOLO está en el catálogo (nunca ha registrado ni una
        // ejecución) es la red de seguridad: lo tratamos como candidato a
        // silencioso en vez de dejarlo invisible.
        const isCatalogOnly = !trackedSet.has(name);
        return {
          name,
          expectedHours,
          lastRunAt: null,
          hoursSinceLastRun: null,
          lastOk: null,
          silent: isCatalogOnly,
          failingLast: false,
        };
      }
      const hours = (Date.now() - new Date(last.at).getTime()) / 3_600_000;
      return {
        name,
        expectedHours,
        lastRunAt: last.at,
        hoursSinceLastRun: Math.round(hours * 10) / 10,
        lastOk: last.ok,
        silent: hours > expectedHours,
        failingLast: !last.ok,
      };
    }),
  );

  const silent = statuses.filter((s) => s.silent);
  const failing = statuses.filter((s) => s.failingLast);
  const unordered = [
    ...silent,
    ...failing.filter((f) => !silent.find((s) => s.name === f.name)),
  ];
  // Los críticos (dinero) primero: el cuerpo del push se trunca a 280 caracteres
  // y hasta ahora el orden lo decidía el alfabeto, así que un sync de proveedor
  // parado podía quedar fuera del mensaje.
  const order = sortBySeverity(unordered.map((i) => i.name));
  const issues = order.map((n) => unordered.find((i) => i.name === n)!);

  // Syncs de proveedor que arrancaron y no cerraron. Es un agujero distinto al
  // del silencio: el cron SÍ se ejecutó (y el runner del VPS reportó HTTP 200,
  // porque el endpoint contesta 202 sin esperar), pero el proceso murió a mitad
  // y su fila de SupplierSync se quedó abierta sin que lo viera nadie.
  // Ver @/lib/suppliers/stalled-sync para el caso medido que motivó esto.
  let stalledSyncs: ReturnType<typeof detectStalledSyncs> = [];
  try {
    const snapshots = await prisma.supplierSync.findMany({
      select: { supplier: true, startedAt: true, finishedAt: true },
    });
    stalledSyncs = detectStalledSyncs(snapshots, Date.now());
  } catch {
    // Telemetría: si la consulta falla, el watchdog sigue haciendo su trabajo
    // con los crons en vez de devolver 500.
  }

  // Anti-spam con memoria de CUÁNDO se avisó: la lista sola no basta, porque un
  // problema que sigue igual dejaba de avisarse para siempre.
  let lastState = { names: [] as string[], at: null as string | null };
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "cron_watchdog_last_alert" },
      select: { value: true },
    });
    if (row) lastState = parseWatchdogAlertState(row.value);
  } catch {
    // ignore — alertaremos si hay issues
  }
  const currentSet = new Set([
    ...issues.map((i) => i.name),
    ...stalledSyncs.map((s) => stalledIssueName(s.supplier)),
  ]);
  const decision = decideWatchdogAlert({
    currentNames: Array.from(currentSet),
    lastNames: lastState.names,
    lastAlertAt: lastState.at,
    nowMs: Date.now(),
  });
  const shouldNotify = decision.notify;

  if (shouldNotify) {
    const lines = issues.map((i) => {
      const tag = i.silent
        ? CRITICAL_CRONS.has(i.name)
          ? "🔴 silencioso"
          : "💤 silencioso"
        : "❌ fallo";
      const detail = i.silent
        ? i.hoursSinceLastRun === null
          ? "nunca ha registrado una ejecución (cron del catálogo sin runs)"
          : `lleva ${i.hoursSinceLastRun}h sin ejecutar (umbral ${i.expectedHours}h)`
        : "última run terminó con error";
      return `· ${i.name}: ${tag} — ${detail}`;
    });
    // Los colgados van DELANTE: un sync a medias deja catálogo, stock y coste
    // de proveedor en un estado intermedio, y el cuerpo del push se trunca.
    lines.unshift(
      ...stalledSyncs.map(
        (s) =>
          `· ${stalledIssueName(s.supplier)}: 🔴 colgado — arrancó hace ${s.hoursRunning}h y no ha cerrado (umbral ${STALLED_AFTER_HOURS}h)`,
      ),
    );
    const titlePrefix = decision.reason === "persistente" ? "⏰ SIGUE" : "⏰";
    const problemCount = issues.length + stalledSyncs.length;
    await notifyAdmins({
      title: `${titlePrefix} ${problemCount} cron${problemCount === 1 ? "" : "s"} con problemas`,
      body: lines.join("\n").slice(0, 280),
      url: "/admin/insights/crons",
      tag: "cron-watchdog-alert",
    });
    // Persistir lista actual + fecha para el anti-spam (la fecha es lo que
    // permite recordar un problema persistente en vez de callar para siempre)
    const state = {
      names: Array.from(currentSet),
      at: new Date().toISOString(),
    };
    try {
      await prisma.adminSetting.upsert({
        where: { key: "cron_watchdog_last_alert" },
        create: {
          key: "cron_watchdog_last_alert",
          value: state as unknown as object,
        },
        update: { value: state as unknown as object },
      });
    } catch {
      // si falla el upsert, la próxima vez volverá a alertar — no es crítico
    }
  } else if (currentSet.size === 0 && lastState.names.length > 0) {
    // Todo OK ahora pero antes había problemas → limpiar memoria de alertas
    const cleared = { names: [] as string[], at: null };
    try {
      await prisma.adminSetting.upsert({
        where: { key: "cron_watchdog_last_alert" },
        create: { key: "cron_watchdog_last_alert", value: cleared as unknown as object },
        update: { value: cleared as unknown as object },
      });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    ok: true,
    totalTracked: others.length,
    silent: silent.map((s) => s.name),
    failing: failing.map((f) => f.name),
    issuesCount: issues.length,
    stalledSyncs,
    notified: shouldNotify,
    notifyReason: decision.reason,
    unwatched: statuses
      .filter((s) => s.unwatchedReason)
      .map((s) => ({ name: s.name, reason: s.unwatchedReason })),
    statuses,
  });
});

// GET para debug manual con mismo secret
export const GET = POST;
