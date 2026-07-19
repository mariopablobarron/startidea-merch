#!/usr/bin/env node
/**
 * Money smoke test — invariantes de NEGOCIO contra el sitio en producción.
 *
 * Codifica lo que hasta ahora se verificaba a mano tras cada deploy. Corre
 * en GitHub Actions (money-smoke.yml) cada 6h y en workflow_dispatch. Solo
 * lecturas públicas (sin secretos): si un cambio futuro reabre uno de estos
 * agujeros, el workflow falla y avisa.
 *
 * Invariantes:
 *  1. El marcaje SE COBRA: quote/calculate con técnica > sin técnica, y
 *     devuelve markings[] (regresión del P0 2026-07-15: Diego cobraba de menos).
 *  2. NUNCA se filtra proveedor: ninguna respuesta pública contiene
 *     midocean/makito/cifra/adivin ni supplierRef (regla de negocio nº1).
 *  3. Tarjetas de Diego dan precio CLIENTE (> 0) y ref pública STM-.
 *  4. /comparar muestra precio real, no "Consultar", para un producto con precio.
 *
 * Uso: BASE=https://merchandising.hubstartidea.es SLUG=taza TECH=P5 node scripts/money-smoke-test.mjs
 */

const BASE = process.env.BASE || "https://merchandising.hubstartidea.es";
const SLUG = process.env.SLUG || "taza";
const TECH = process.env.TECH || "P5"; // técnica de marcaje válida para SLUG
const SUPPLIER_LEAKS = ["midocean", "makito", "cifra", "adivin", "supplierref", "supplier_ref"];

const fails = [];
const oks = [];
function check(name, cond, detail = "") {
  if (cond) oks.push(name);
  else fails.push(`${name}${detail ? " — " + detail : ""}`);
}

async function getJson(path, opts) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-json */ }
  return { status: r.status, json, text };
}

async function main() {
  // ── 1. Marcaje se cobra ──────────────────────────────────────────
  const bare = await getJson("/api/quote/calculate", {
    method: "POST",
    body: JSON.stringify({ productSlug: SLUG, quantity: 100 }),
  });
  const marked = await getJson("/api/quote/calculate", {
    method: "POST",
    body: JSON.stringify({ productSlug: SLUG, quantity: 100, techniqueCode: TECH, numberOfColours: 1, positionCount: 1 }),
  });
  check("quote/calculate responde", bare.status === 200 && marked.status === 200, `status ${bare.status}/${marked.status}`);
  const bareUnit = bare.json?.unitClientCents;
  const markedUnit = marked.json?.unitClientCents;
  check("precio base > 0", typeof bareUnit === "number" && bareUnit > 0, `unit=${bareUnit}`);
  check(
    "el marcaje incrementa el precio (P0)",
    typeof markedUnit === "number" && typeof bareUnit === "number" && markedUnit > bareUnit,
    `con marcaje ${markedUnit} vs sin ${bareUnit}`,
  );
  check(
    "quote devuelve markings[] al pasar técnica (P0)",
    Array.isArray(marked.json?.markings) && marked.json.markings.length > 0,
    `markings=${JSON.stringify(marked.json?.markings)?.slice(0, 80)}`,
  );

  // ── 2. Sin fuga de proveedor en respuestas públicas ──────────────
  const publicSurfaces = [
    `/api/products/cards?slugs=${encodeURIComponent(SLUG)}`,
    `/catalogo/${encodeURIComponent(SLUG)}`,
    `/comparar?slugs=${encodeURIComponent(SLUG)}`,
  ];
  for (const path of publicSurfaces) {
    const r = await fetch(BASE + path);
    const body = (await r.text()).toLowerCase();
    const leak = SUPPLIER_LEAKS.find((s) => body.includes(s));
    check(`sin proveedor en ${path}`, !leak, leak ? `contiene "${leak}"` : "");
  }

  // ── 3. Tarjetas Diego: precio cliente + ref pública ──────────────
  const cards = await getJson(`/api/products/cards?slugs=${encodeURIComponent(SLUG)}`);
  const card = cards.json?.items?.[0];
  check("tarjeta Diego existe", !!card, `items=${cards.json?.items?.length}`);
  check("tarjeta con precio cliente > 0", typeof card?.priceFromCents === "number" && card.priceFromCents > 0, `price=${card?.priceFromCents}`);
  check("tarjeta con ref pública STM-", typeof card?.ref === "string" && card.ref.startsWith("STM-"), `ref=${card?.ref}`);

  // ── 4. /comparar con precio real ─────────────────────────────────
  const cmp = await fetch(`${BASE}/comparar?slugs=${encodeURIComponent(SLUG)}`);
  const cmpBody = await cmp.text();
  check("/comparar muestra un precio con €", /\d+,\d{2}\s*€/.test(cmpBody), "no se encontró patrón de precio");

  // ── Reporte ──────────────────────────────────────────────────────
  console.log(`\n💰 Money smoke test contra ${BASE}\n`);
  for (const o of oks) console.log(`  ✓ ${o}`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`\n${oks.length} ok, ${fails.length} fallos\n`);
  if (fails.length > 0) {
    console.error("❌ INVARIANTE DE NEGOCIO ROTA — revisar cuanto antes.");
    process.exit(1);
  }
  console.log("✅ Todos los invariantes de dinero/proveedor OK.");
}

main().catch((e) => {
  console.error("Error ejecutando el smoke test:", e);
  process.exit(1);
});
