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
 * Uso: BASE=https://merchandising.startidea.es SLUG=taza TECH=P5 node scripts/money-smoke-test.mjs
 */

const BASE = process.env.BASE || "https://merchandising.startidea.es";
const SLUG = process.env.SLUG || "taza";
const TECH = process.env.TECH || "P5"; // técnica de marcaje válida para SLUG
const SUPPLIER_LEAKS = ["midocean", "makito", "cifra", "adivin", "supplierref", "supplier_ref"];
// Hosts de CDN de proveedor. Van APARTE porque varios NO contienen el nombre
// del proveedor y la lista de arriba no los atrapaba: así es como la fuga del
// 2026-07-20 en /api/recommend pasó el guard. Ver incident_midocean_image_leak.
const SUPPLIER_HOSTS = [
  "cdn1.midocean.com",
  "publicatalogue.com",
  "imgresources.makito.es",
  "adivin.com",
];
const ALL_LEAKS = [...SUPPLIER_LEAKS, ...SUPPLIER_HOSTS];

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
  // Se barren TODAS las superficies públicas que devuelven productos, GET y
  // POST. Antes solo había 3 GET, y por eso /api/recommend (POST) filtró el
  // CDN del proveedor durante meses sin que el guard se enterase.
  const publicSurfaces = [
    { path: `/api/products/cards?slugs=${encodeURIComponent(SLUG)}` },
    { path: `/catalogo/${encodeURIComponent(SLUG)}` },
    { path: `/comparar?slugs=${encodeURIComponent(SLUG)}` },
    {
      path: "/api/recommend",
      method: "POST",
      body: {
        brief:
          "Necesito regalos corporativos para un congreso de 200 personas, algo util y de calidad",
        quantity: 200,
      },
    },
    // NO se barren aquí (dan 401 sin credenciales, y este guard corre sin
    // secretos): /api/v1/products (API key con scope) y las tools del agente
    // de voz (secreto compartido). Su limpieza está verificada por código
    // —usan `select` explícito sin `images`/`supplierRef`— no por este smoke.
    {
      path: "/api/quote/calculate",
      method: "POST",
      body: { productSlug: SLUG, quantity: 100, techniqueCode: TECH, numberOfColours: 1, positionCount: 1 },
    },
  ];
  for (const surface of publicSurfaces) {
    const { path, method = "GET", body } = surface;
    const r = await fetch(BASE + path, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const text = (await r.text()).toLowerCase();
    // Un 4xx/5xx deja el barrido ciego: si la superficie no responde, el guard
    // no puede afirmar que esté limpia — se marca como fallo, no como OK.
    check(`${method} ${path} responde`, r.status === 200, `status ${r.status}`);
    const leak = ALL_LEAKS.find((s) => text.includes(s));
    check(`sin proveedor en ${method} ${path}`, !leak, leak ? `contiene "${leak}"` : "");
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
