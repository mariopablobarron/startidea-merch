#!/usr/bin/env bun
/**
 * Auditoría de headers HTTP de seguridad en producción.
 *
 * Chequea HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 * Permissions-Policy, Cross-Origin-Opener-Policy. También avisa si la app
 * expone X-Powered-By o Server.
 *
 * Uso:
 *   bun scripts/audit-security-headers.ts
 *   bun scripts/audit-security-headers.ts --url=https://otra.url
 */

const url = arg("--url") || "https://merchandising.startidea.es";

type Check = {
  header: string;
  required: boolean;
  validate: (value: string | null) => { ok: boolean; reason?: string };
  recommended?: string;
};

const CHECKS: Check[] = [
  {
    header: "strict-transport-security",
    required: true,
    validate: (v) => {
      if (!v) return { ok: false, reason: "ausente" };
      const m = v.match(/max-age=(\d+)/i);
      const age = m ? parseInt(m[1], 10) : 0;
      if (age < 31536000) return { ok: false, reason: `max-age=${age} (recomendado ≥ 1 año)` };
      return { ok: true };
    },
    recommended: "max-age=63072000; includeSubDomains; preload",
  },
  {
    header: "x-content-type-options",
    required: true,
    validate: (v) =>
      v?.toLowerCase() === "nosniff" ? { ok: true } : { ok: false, reason: "debe ser nosniff" },
    recommended: "nosniff",
  },
  {
    header: "x-frame-options",
    required: true,
    validate: (v) => {
      if (!v) return { ok: false, reason: "ausente" };
      const u = v.toUpperCase();
      if (u === "DENY" || u === "SAMEORIGIN") return { ok: true };
      return { ok: false, reason: `valor "${v}" — usa DENY o SAMEORIGIN` };
    },
    recommended: "DENY",
  },
  {
    header: "referrer-policy",
    required: true,
    validate: (v) =>
      v ? { ok: true } : { ok: false, reason: "ausente" },
    recommended: "strict-origin-when-cross-origin",
  },
  {
    header: "permissions-policy",
    required: true,
    validate: (v) =>
      v ? { ok: true } : { ok: false, reason: "ausente — denegar APIs no usadas" },
    recommended: "camera=(), microphone=(), geolocation=()",
  },
  {
    header: "cross-origin-opener-policy",
    required: false,
    validate: (v) =>
      v ? { ok: true } : { ok: false, reason: "ausente (recomendado same-origin)" },
    recommended: "same-origin",
  },
  {
    header: "content-security-policy",
    required: false,
    validate: (v) =>
      v ? { ok: true } : { ok: false, reason: "ausente — sin CSP estricta (TODO)" },
    recommended: "default-src 'self'; …",
  },
];

const LEAKS = ["x-powered-by", "server"];

console.log(`\n  🔒 Audit headers HTTP de seguridad → ${url}\n`);

const res = await fetch(url, { method: "GET", redirect: "follow" });
const headers = new Map(Array.from(res.headers.entries()).map(([k, v]) => [k.toLowerCase(), v]));

let pass = 0;
let fail = 0;
let warn = 0;

for (const c of CHECKS) {
  const v = headers.get(c.header) ?? null;
  const result = c.validate(v);
  if (result.ok) {
    console.log(`  \x1b[32m✓\x1b[0m ${c.header.padEnd(32)} ${(v || "").slice(0, 70)}`);
    pass++;
  } else if (c.required) {
    console.log(
      `  \x1b[31m✗\x1b[0m ${c.header.padEnd(32)} ${result.reason}`,
    );
    if (c.recommended)
      console.log(`     \x1b[90m└ recomendado: ${c.recommended}\x1b[0m`);
    fail++;
  } else {
    console.log(
      `  \x1b[33m⚠\x1b[0m ${c.header.padEnd(32)} ${result.reason}`,
    );
    if (c.recommended)
      console.log(`     \x1b[90m└ sugerido: ${c.recommended}\x1b[0m`);
    warn++;
  }
}

// Fugas de info
console.log();
for (const leak of LEAKS) {
  const v = headers.get(leak);
  if (v) {
    console.log(`  \x1b[33m⚠\x1b[0m fuga info  → ${leak}: ${v}`);
    warn++;
  }
}

console.log(
  `\n  Resumen: \x1b[32m${pass} OK\x1b[0m · \x1b[31m${fail} fail\x1b[0m · \x1b[33m${warn} warn\x1b[0m\n`,
);

if (fail > 0) process.exit(1);

function arg(name: string): string | undefined {
  const m = process.argv.slice(2).find((a) => a.startsWith(`${name}=`));
  return m ? m.split("=").slice(1).join("=") : undefined;
}
