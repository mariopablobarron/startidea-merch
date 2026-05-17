#!/usr/bin/env bun
/**
 * Resumen rápido del estado de los crons en producción.
 *
 * Uso:
 *   bun scripts/cron-stats.ts
 *   bun scripts/cron-stats.ts --site=https://merchandising.hubstartidea.es
 *
 * Necesita ADMIN_SECRET en env (o lee de ../.env si existe).
 */

const SITE = arg("--site") || process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const ADMIN_SECRET = process.env.ADMIN_SECRET || readDotEnv()?.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error("⚠ ADMIN_SECRET no encontrado en env ni en .env del proyecto");
  process.exit(1);
}

type RunLog = {
  startedAt: string;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  triggeredBy: string;
  error: string | null;
};

type CronRow = {
  name: string;
  schedule: string;
  frequencyHours: number;
  status: "OK" | "STALE" | "NEVER" | "RUNNING" | "FAILED";
  last: RunLog | null;
  lastRuns: RunLog[];
};

const res = await fetch(`${SITE}/api/admin/crons`, {
  headers: { "X-Admin-Secret": ADMIN_SECRET },
});
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(2);
}
const data = (await res.json()) as { crons: CronRow[]; generatedAt: string };

const ICON = {
  OK: "\x1b[32m✓\x1b[0m",
  STALE: "\x1b[33m⚠\x1b[0m",
  NEVER: "\x1b[90m·\x1b[0m",
  RUNNING: "\x1b[34m⟳\x1b[0m",
  FAILED: "\x1b[31m✗\x1b[0m",
} as const;

const sum = {
  OK: 0, STALE: 0, NEVER: 0, RUNNING: 0, FAILED: 0, total: data.crons.length,
};
for (const c of data.crons) sum[c.status]++;

console.log(`\n  Cron stats · ${data.generatedAt}`);
console.log(
  `  OK ${sum.OK}/${sum.total} · STALE ${sum.STALE} · FAILED ${sum.FAILED} · NEVER ${sum.NEVER} · RUNNING ${sum.RUNNING}\n`,
);

// Latencias y errores recientes
for (const c of data.crons) {
  const lat = c.last?.durationMs != null ? `${c.last.durationMs}ms` : "—";
  const when = c.last
    ? new Date(c.last.startedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : "—";
  const by = c.last ? `\x1b[90m${c.last.triggeredBy}\x1b[0m` : "";
  console.log(
    `  ${ICON[c.status]} ${c.name.padEnd(32)} ${c.status.padEnd(8)} ${when.padEnd(18)} ${lat.padStart(7)} ${by}`,
  );

  // Si hay fallos en los últimos 5, mostrar el último error
  const recentFail = c.lastRuns.find((r) => !r.ok);
  if (recentFail && c.status !== "FAILED") {
    console.log(`       \x1b[31m└ último fail: ${recentFail.error || `HTTP ${recentFail.httpStatus}`}\x1b[0m`);
  }
}

console.log();

// ── helpers
function arg(name: string): string | undefined {
  const m = process.argv.slice(2).find((a) => a.startsWith(`${name}=`));
  return m ? m.split("=").slice(1).join("=") : undefined;
}

function readDotEnv(): Record<string, string> | null {
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const file = path.join(import.meta.dir, "..", ".env");
    const text = fs.readFileSync(file, "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return null;
  }
}
