#!/usr/bin/env bun
/**
 * Escanea páginas públicas en producción buscando fugas del proveedor:
 *   - Hostnames CDN: cdn1.midocean.com, *.makito.com, etc.
 *   - Patrones SKU en URLs/HTML: ar1234, mo9812, cx1013, mk-xxxx
 *
 * Reporta hallazgos (página + contexto) o "limpio".
 *
 * Uso: bun scripts/audit-supplier-leaks.ts
 */

const SITE = process.env.SITE_URL || "https://merchandising.hubstartidea.es";

// Patrones tóxicos
const LEAK_PATTERNS = [
  { code: "cdn1-midocean", re: /cdn1\.midocean\.com\/[^"'\s]*/gi },
  { code: "makito-cdn", re: /[a-z0-9.-]*\.makito\.com\/[^"'\s]*/gi },
  { code: "supplier-sku", re: /\b(ar|mo|cx|mk)[0-9]{3,5}\b/gi },
];

// Páginas a auditar
const ROUTES = [
  "/",
  "/catalogo",
  "/catalogo/target",
  "/catalogo/boc",
  "/catalogo/columbus",
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
      console.log(`\x1b[90m  · ${route} → HTTP ${r.status} (skip)\x1b[0m`);
      continue;
    }
    html = await r.text();
  } catch (e) {
    console.log(`\x1b[31m  ✗ ${route} → ${e instanceof Error ? e.message : "fetch error"}\x1b[0m`);
    continue;
  }

  for (const p of LEAK_PATTERNS) {
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
  console.log(`    ${h.pattern.padEnd(18)} ${h.route.padEnd(30)} ${h.sample.slice(0, 80)}`);
}
console.log("");
process.exit(1);
