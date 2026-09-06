#!/usr/bin/env bun
/**
 * Barrido manual anti-fuga de proveedor contra producción.
 *
 * La lógica vive en `src/lib/public-leak-scan.ts`, compartida con el barrido
 * automático (`src/lib/public-leak-audit.live.test.ts`, que dispara
 * `.github/workflows/supplier-leak-audit.yml` cada 6 h). Tener dos copias del
 * escaneo es exactamente cómo divergieron los detectores el 2026-08-13: las
 * listas seguían idénticas y lo que cambió fue CÓMO se buscaba.
 *
 * Uso: bun scripts/audit-supplier-leaks.ts
 */

import { pickAuditRoutes, scanHtmlForLeaks, veredicto } from "../src/lib/public-leak-scan";

const SITE = process.env.SITE_URL || "https://merchandising.startidea.es";
const MUESTRA = Number(process.env.LEAK_AUDIT_SAMPLE || 40);

/** Superficies de contenido que no dependen de un slug. */
const SEMILLAS = [
  "/",
  "/catalogo",
  "/promociones",
  "/comparar",
  "/recursos",
  "/sectores/tech",
  "/sectores/eventos",
  "/llms.txt",
  "/docs/api",
  "/privacidad",
];

async function traer(ruta: string): Promise<{ html: string } | { fallo: string }> {
  try {
    const r = await fetch(`${SITE}${ruta}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return { fallo: `HTTP ${r.status}` };
    return { html: await r.text() };
  } catch {
    return { fallo: "error de red" };
  }
}

const sitemap = await traer("/sitemap.xml");
const rutas = pickAuditRoutes({
  sitemapXml: "html" in sitemap ? sitemap.html : "",
  site: SITE,
  seedRoutes: SEMILLAS,
  sample: MUESTRA,
  offset: Math.floor(Date.now() / 3_600_000),
});

const fugas: Array<{ ruta: string; code: string }> = [];
let inalcanzables = 0;
let comprobadas = 0;

for (const ruta of rutas) {
  const res = await traer(ruta);
  if ("fallo" in res) {
    inalcanzables++;
    console.log(`\x1b[33m  ? ${ruta} → ${res.fallo} (sin comprobar)\x1b[0m`);
    continue;
  }
  comprobadas++;
  const hits = scanHtmlForLeaks(res.html);
  for (const h of hits) fugas.push({ ruta, code: h.code });
  console.log(hits.length === 0 ? `\x1b[32m  ✓ ${ruta}\x1b[0m` : `\x1b[31m  ✗ ${ruta}\x1b[0m`);
}

const v = veredicto({ fugas: fugas.length, inalcanzables, comprobadas });
console.log(
  `\n  ${rutas.length} rutas · ${comprobadas} comprobadas · ${inalcanzables} sin comprobar\n`,
);

if (v === "limpio") {
  console.log("\x1b[32m  → Sin fugas detectadas. Privacidad proveedor OK.\x1b[0m\n");
  process.exit(0);
}

if (v === "inalcanzable") {
  // Ninguna respondió: el problema está en la red o en el host, no en una
  // página. Decirlo como «no comprobado» manda a buscar donde no es.
  console.log("\x1b[33m  → INALCANZABLE: no respondió NINGUNA superficie (red o host).\x1b[0m\n");
  process.exit(1);
}

if (v === "no-comprobado") {
  // No es un verde, pero tampoco se afirma una fuga que no consta.
  console.log("\x1b[33m  → NO COMPROBADO: alguna superficie no respondió.\x1b[0m\n");
  process.exit(1);
}

console.log("\x1b[31m  → Fugas detectadas:\x1b[0m\n");
for (const f of fugas) {
  // El valor no se imprime: sería publicar la fuga en el log.
  console.log(`    ${f.code.padEnd(22)} ${f.ruta}`);
}
console.log("");
process.exit(1);
