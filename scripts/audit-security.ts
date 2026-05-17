#!/usr/bin/env bun
/**
 * Ejecuta las 5 capas de auditoría de seguridad en tu Mac antes de hacer push.
 * Mismas herramientas que el workflow GitHub Actions, pero locales y rápidas.
 *
 * Requisitos previos (brew install ...):
 *   gitleaks · trivy · semgrep · hadolint
 *   knip se invoca via pnpm dlx (no requiere install global)
 *
 * Uso:
 *   bun scripts/audit-security.ts
 *   bun scripts/audit-security.ts --only=gitleaks,trivy
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1].split(",") : null;

type Tool = {
  name: string;
  check: () => boolean;
  run: () => { ok: boolean; summary: string };
};

const TOOLS: Tool[] = [
  {
    name: "gitleaks",
    check: () => which("gitleaks"),
    run: () => {
      const r = spawnSync(
        "gitleaks",
        ["detect", "--source", ".", "--no-banner", "--redact"],
        { encoding: "utf8" },
      );
      const txt = (r.stdout || "") + (r.stderr || "");
      const m = txt.match(/leaks found: (\d+)/);
      const leaks = m ? parseInt(m[1], 10) : null;
      return {
        ok: r.status === 0,
        summary:
          leaks != null
            ? `${leaks} leaks ${leaks === 0 ? "✓" : "(revisar .gitleaksignore)"}`
            : `exit ${r.status}`,
      };
    },
  },
  {
    name: "trivy-fs",
    check: () => which("trivy"),
    run: () => {
      const r = spawnSync(
        "trivy",
        [
          "fs", ".", "--scanners", "vuln", "--severity", "HIGH,CRITICAL",
          "--skip-dirs", "node_modules,.next", "--quiet", "--exit-code", "1",
        ],
        { encoding: "utf8" },
      );
      return {
        ok: r.status === 0,
        summary: r.status === 0 ? "0 CVE HIGH/CRITICAL ✓" : "CVE detectados — revisar output",
      };
    },
  },
  {
    name: "trivy-config",
    check: () => which("trivy"),
    run: () => {
      const r = spawnSync(
        "trivy",
        ["config", "Dockerfile", "--severity", "HIGH,CRITICAL", "--quiet", "--exit-code", "1"],
        { encoding: "utf8" },
      );
      return {
        ok: r.status === 0,
        summary: r.status === 0 ? "Dockerfile clean ✓" : "misconfiguración HIGH/CRITICAL",
      };
    },
  },
  {
    name: "semgrep",
    check: () => which("semgrep"),
    run: () => {
      // Solo fallar en severidad ERROR/WARNING. INFO suele ser ruido/heurístico.
      const r = spawnSync(
        "semgrep",
        [
          "scan", "--config", "auto",
          "--exclude=.next", "--exclude=node_modules",
          "--severity=ERROR", "--severity=WARNING",
          "--quiet", "--error",
        ],
        { encoding: "utf8" },
      );
      return {
        ok: r.status === 0,
        summary: r.status === 0 ? "0 ERROR/WARNING ✓" : "findings ERROR/WARNING — revisar",
      };
    },
  },
  {
    name: "knip",
    check: () => which("pnpm"),
    run: () => {
      const r = spawnSync("pnpm", ["dlx", "knip", "--reporter", "compact"], {
        encoding: "utf8",
      });
      // knip exit 1 si hay issues. Lo tomamos como aviso, no fail
      const matches = (r.stdout || "").match(/(\d+) unused/g);
      return {
        ok: true,
        summary: matches ? matches.join(" · ") : "sin código muerto detectado",
      };
    },
  },
  {
    name: "hadolint",
    check: () => which("hadolint"),
    run: () => {
      const r = spawnSync("hadolint", ["--ignore", "DL3018", "Dockerfile"], {
        encoding: "utf8",
      });
      return {
        ok: r.status === 0,
        summary: r.status === 0 ? "Dockerfile lint OK ✓" : (r.stdout || "").split("\n").slice(0, 3).join(" / "),
      };
    },
  },
];

const filtered = only ? TOOLS.filter((t) => only.includes(t.name) || only.includes(t.name.split("-")[0])) : TOOLS;

console.log("\n  🔒 Security audit local\n");

let hadFail = false;
for (const tool of filtered) {
  if (!tool.check()) {
    console.log(`  ⊘ ${tool.name.padEnd(16)} (no instalado · saltado)`);
    continue;
  }
  process.stdout.write(`  ⏳ ${tool.name.padEnd(16)} `);
  const startedAt = Date.now();
  const res = tool.run();
  const ms = Date.now() - startedAt;
  const icon = res.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`\r  ${icon} ${tool.name.padEnd(16)} ${res.summary}  \x1b[90m(${ms}ms)\x1b[0m`);
  if (!res.ok) hadFail = true;
}
console.log();
if (hadFail) {
  console.log("\x1b[31m  → 1 o más checks fallaron. Ejecuta la herramienta individual para ver detalle.\x1b[0m\n");
  process.exit(1);
}
console.log("\x1b[32m  → Todos los checks pasaron.\x1b[0m\n");

function which(bin: string): boolean {
  const r = spawnSync("which", [bin]);
  return r.status === 0;
}
