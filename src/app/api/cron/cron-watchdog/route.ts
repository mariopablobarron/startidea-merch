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
 * Anti-spam: alerta solo si lista de silenciosos hoy es distinta
 * a la de ayer (AdminSetting `cron_watchdog_last_alert`).
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Umbral en horas por cron. Si no aparece → default 30h.
const EXPECTED_HOURS: Record<string, number> = {
  "metric-snapshot": 2, // cada hora
  "ai-usage-alert": 30, // diario
  "auto-resolve-errors": 30, // diario
  "product-view-rollup": 30, // diario
  "insights-digest": 8 * 24, // semanal
  "insights-digest-monthly": 35 * 24, // mensual
};

const DEFAULT_HOURS = 30;

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
  };

  const statuses: Status[] = await Promise.all(
    others.map(async (name) => {
      const runs = await getCronHistory(name);
      const last = runs[0];
      const expectedHours = EXPECTED_HOURS[name] ?? DEFAULT_HOURS;
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
  const issues = [...silent, ...failing.filter((f) => !silent.find((s) => s.name === f.name))];

  // Anti-spam: alerta solo si la lista actual difiere de la última alertada
  let shouldNotify = issues.length > 0;
  let lastAlertedSet = new Set<string>();
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "cron_watchdog_last_alert" },
      select: { value: true },
    });
    if (row && Array.isArray(row.value)) {
      lastAlertedSet = new Set(row.value as unknown as string[]);
    }
  } catch {
    // ignore — alertaremos si hay issues
  }
  const currentSet = new Set(issues.map((i) => i.name));
  const sameAsBefore =
    currentSet.size === lastAlertedSet.size &&
    Array.from(currentSet).every((n) => lastAlertedSet.has(n));
  if (sameAsBefore) shouldNotify = false;

  if (shouldNotify) {
    const lines = issues.map((i) => {
      const tag = i.silent ? "💤 silencioso" : "❌ fallo";
      const detail = i.silent
        ? i.hoursSinceLastRun === null
          ? "nunca ha registrado una ejecución (cron del catálogo sin runs)"
          : `lleva ${i.hoursSinceLastRun}h sin ejecutar (umbral ${i.expectedHours}h)`
        : "última run terminó con error";
      return `· ${i.name}: ${tag} — ${detail}`;
    });
    await notifyAdmins({
      title: `⏰ ${issues.length} cron${issues.length === 1 ? "" : "s"} con problemas`,
      body: lines.join("\n").slice(0, 280),
      url: "/admin/insights/crons",
      tag: "cron-watchdog-alert",
    });
    // Persistir lista actual para anti-spam
    try {
      await prisma.adminSetting.upsert({
        where: { key: "cron_watchdog_last_alert" },
        create: {
          key: "cron_watchdog_last_alert",
          value: Array.from(currentSet) as unknown as object,
        },
        update: { value: Array.from(currentSet) as unknown as object },
      });
    } catch {
      // si falla el upsert, la próxima vez volverá a alertar — no es crítico
    }
  } else if (issues.length === 0 && lastAlertedSet.size > 0) {
    // Todo OK ahora pero antes había problemas → limpiar memoria de alertas
    try {
      await prisma.adminSetting.upsert({
        where: { key: "cron_watchdog_last_alert" },
        create: { key: "cron_watchdog_last_alert", value: [] as unknown as object },
        update: { value: [] as unknown as object },
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
    notified: shouldNotify,
    statuses,
  });
});

// GET para debug manual con mismo secret
export const GET = POST;
