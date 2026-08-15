#!/usr/bin/env bun
/**
 * Escanea páginas públicas en producción buscando fugas del proveedor:
 *   - Hostnames CDN MidOcean: cdn1.midocean.com, printposition-img-api-v2.cdn.midocean.com
 *   - Hostnames CDN Cifra: publicatalogue.com, www.publicatalogue.com
 *   - Hostnames CDN Makito: imgresources.makito.es, data.makito.es, print.makito.es
 *   - Patrones SKU en URLs/HTML: ar1234, mo9812, cx1013, mk-xxxx
 *   - Slugs con prefijo proveedor: cif-XXX, mak-XXX
 *
 * Reporta hallazgos (página + contexto) o "limpio".
 *
 * Uso: bun scripts/audit-supplier-leaks.ts
 */

import { PUBLIC_SUPPLIER_LEAK_PATTERNS } from "../src/lib/public-supplier-leak-patterns";

const SITE = process.env.SITE_URL || "https://merchandising.startidea.es";

// Páginas a auditar
const ROUTES = [
  "/",
  "/catalogo",
  "/catalogo/target",
  "/catalogo/boc",
  "/catalogo/columbus",
  "/catalogo/camiseta-adulto-runner",
  "/promociones",
  "/comparar",
  "/sectores/tech",
  "/sectores/eventos",
  "/sitemap.xml",
];

type Hit = { route: string; pattern: string; sample: string };
const hits: Hit[] = [];

for (const route of ROUTES) {
  let html = "";
  try {
    const r = await fetch(`${SITE}${route}`);
    if (!r.ok) {
      hits.push({ route, pattern: "http-error", sample: `HTTP ${r.status}` });
      console.log(`\x1b[31m  ✗ ${route} → HTTP ${r.status}\x1b[0m`);
      continue;
    }
    html = await r.text();
  } catch (e) {
    hits.push({ route, pattern: "network-error", sample: "fetch failed" });
    console.log(`\x1b[31m  ✗ ${route} → error de red\x1b[0m`);
    continue;
  }

  for (const p of PUBLIC_SUPPLIER_LEAK_PATTERNS) {
    const matches = html.match(p.re);
    if (!matches) continue;
    // Filtrar falsos positivos: meta name="google-site-verification" tiene patrones aleatorios
    const real = matches.filter((m) => {
      const lower = m.toLowerCase();
      // ignorar si está dentro de meta verification de google
      const ctx = html.substring(Math.max(0, html.indexOf(m) - 80), html.indexOf(m) + m.length + 80);
      if (/google-site-verification/i.test(ctx)) return false;
      // ignorar nombres como "claus" "atoll" que casualmente contienen mo/ar
      if (p.code === "supplier-sku") {
        // Solo cuenta si está delimitado por contexto técnico (.jpg, .png, /, querystring)
        const sku = lower;
        const next = html.charAt(html.indexOf(m) + m.length);
        // si lo siguiente es letra, no es SKU sino parte de palabra
        if (/[a-z]/i.test(next)) return false;
      }
      return true;
    });
    if (real.length === 0) continue;
    const sample = real[0];
    hits.push({ route, pattern: p.code, sample });
  }

  if (hits.filter((h) => h.route === route).length === 0) {
    console.log(`\x1b[32m  ✓ ${route}\x1b[0m`);
  } else {
    console.log(`\x1b[31m  ✗ ${route}\x1b[0m`);
  }
}

console.log("");
if (hits.length === 0) {
  console.log("\x1b[32m  → Sin fugas detectadas. Privacidad proveedor OK.\x1b[0m\n");
  process.exit(0);
}

console.log("\x1b[31m  → Fugas detectadas:\x1b[0m\n");
for (const h of hits) {
  const detail = h.pattern === "http-error" ? h.sample : "[valor oculto]";
  console.log(`    ${h.pattern.padEnd(18)} ${h.route.padEnd(38)} ${detail}`);
}
console.log("");
process.exit(1);
