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
 * Un invariante sobre una respuesta que NO llegó no es ni verde ni rojo: es
 * NO COMPROBADO. Y "no comprobado" jamás cuenta como verde — ver `unchecked()`.
 *
 * Uso: BASE=https://merchandising.startidea.es SLUG=taza TECH=P5 node scripts/money-smoke-test.mjs
 */

import { pathToFileURL } from "node:url";
import { appendFileSync } from "node:fs";

const BASE = process.env.BASE || "https://merchandising.startidea.es";
const SLUG = process.env.SLUG || "taza";
const TECH = process.env.TECH || "P5"; // técnica de marcaje válida para SLUG
// DOS grupos, porque los términos no son de la misma naturaleza. Réplica
// literal de lib/supplier-leak-terms.ts (fuente TS que este script no puede
// importar — Node suelto); el guard de concepto-propuesta-cableado compara las
// listas Y la estrategia, que es justo lo que se desincronizó el 13-ago.
//
// SUBCADENA: ninguno existe dentro de una palabra española, así que no hay
// falso positivo posible y así se cazan pegados dentro de un identificador
// (`midoceanOrderId`, `makito_sku`) — que es como un nombre de proveedor llega
// de verdad a un JSON servido. Buscarlos por palabra completa dejó pasar
// exactamente el campo cuya fuga se cerró el 13-ago.
const SUPPLIER_LEAKS_IDENTIFIER = ["midocean", "makito", "supplierref", "supplier_ref"];
// PALABRA COMPLETA (+ frontera de identificador): "cifra" está dentro de
// "cifrado"/"cifras" y "adivin" dentro de "adivinanza"; por subcadena marcaban
// texto legítimo y tumbaron el CI el 13-ago (/llms.txt, /privacidad).
const SUPPLIER_LEAKS_WORDLIKE = ["cifra", "adivin"];
const SUPPLIER_LEAKS = [...SUPPLIER_LEAKS_IDENTIFIER, ...SUPPLIER_LEAKS_WORDLIKE];
// Hosts de CDN de proveedor. Van APARTE y SÍ por subcadena porque varios NO
// contienen el nombre del proveedor y los puntos no son límite de palabra:
// así es como la fuga del 2026-07-20 en /api/recommend pasó el guard. Ver
// incident_midocean_image_leak.
const SUPPLIER_HOSTS = [
  "cdn1.midocean.com",
  "publicatalogue.com",
  "imgresources.makito.es",
  "adivin.com",
];

/** "cifra" → "[cC][iI][fF][rR][aA]": insensible a mayúsculas sin el flag `i`. */
function anyCase(term) {
  return term.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
}

// Exportada a propósito: `supplier-leak-paridad.test.ts` la EJECUTA con los
// mismos casos que findSupplierLeak() de lib/. Comparar el texto de las dos
// listas —lo que ya hace el guard— no habría cazado el fallo del 13-ago, en
// que las listas eran idénticas y lo que divergió fue el comportamiento.
export function findLeak(text) {
  const haystack = text.toLowerCase();
  for (const host of SUPPLIER_HOSTS) {
    if (haystack.includes(host)) return host;
  }
  for (const term of SUPPLIER_LEAKS_IDENTIFIER) {
    if (haystack.includes(term)) return term;
  }
  for (const term of SUPPLIER_LEAKS_WORDLIKE) {
    if (new RegExp(`(^|[^a-z0-9_])${term}($|[^a-z0-9_])`).test(haystack)) return term;
    // Sobre el ORIGINAL y sin flag `i`: la mayúscula siguiente ES la señal de
    // que es un identificador (`cifraOrderId`) y no la palabra española.
    if (new RegExp(`(^|[^A-Za-z0-9_])${anyCase(term)}(?=[A-Z_])`).test(text)) return term;
  }
  return null;
}

/**
 * Techo por petición. `fetch` no trae uno propio: undici corta la CONEXIÓN a
 * los ~10 s, pero una vez conectado espera cabeceras hasta 300 s. Con 9
 * peticiones y 3 intentos cada una, una red mala se comía de sobra los 3 min
 * del job — y ahí es donde el guard moría (ver BUDGET_MS).
 * 20 s deja holgura a `/api/recommend`, que tarda 8-12 s de forma legítima
 * porque llama al LLM; bajarlo lo marcaría caído sin estarlo.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 20_000);

/**
 * Presupuesto total del barrido, y la razón de ser de este bloque.
 *
 * El 2026-08-05 a las 03:32 UTC este job se quedó CANCELADO al tocar el
 * `timeout-minutes: 3`. Un job cancelado NO es un job fallido: `if: failure()`
 * no se ejecuta ⇒ **no salió la alerta de Telegram**, y en la lista de runs
 * quedó un "cancelled" que se lee como algo manual y benigno. O sea: el guard
 * que vigila el dinero y la fuga de proveedor se murió en silencio justo en el
 * escenario para el que se le añadió la resiliencia de red.
 *
 * Con presupuesto, quien decide el resultado es el script y no GitHub: al
 * agotarse, las superficies que falten se registran como NO COMPROBADAS
 * (jamás como ok) y el barrido llega igual a clasificar y a avisar.
 */
const BUDGET_MS = Number(process.env.SMOKE_BUDGET_MS || 240_000);

/**
 * Cuánto se le concede al siguiente intento sin pasarse del presupuesto.
 * Pura y exportada: es la que garantiza que el barrido TERMINA.
 * 0 significa "no queda presupuesto" ⇒ ni se toca la red.
 */
export function timeoutParaIntento(deadline, ahora, maxPorPeticion = REQUEST_TIMEOUT_MS) {
  const restante = deadline - ahora;
  if (restante <= 0) return 0;
  return Math.min(maxPorPeticion, restante);
}

/** Instante límite del barrido. Lo fija `main()`; importar el módulo no arranca el reloj. */
let deadline = Number.POSITIVE_INFINITY;

/**
 * Categorías de fallo. Las dos hacen fallar el job — esto NO relaja el guard.
 * Lo que cambia es lo que se le dice a quien recibe la alerta:
 *  - MONEY: una invariante de dinero o de exposición de proveedor se ha roto
 *    de verdad. Es el aviso grave, y tiene que seguir doliendo.
 *  - AVAILABILITY: una superficie pública no respondió, así que sus
 *    invariantes no se han podido comprobar. Sigue siendo un problema, pero
 *    afirmar "se rompió una invariante de dinero" sería FALSO.
 */
export const KIND_MONEY = "money";
export const KIND_AVAILABILITY = "availability";

const results = [];
function check(name, cond, detail = "", kind = KIND_MONEY) {
  results.push({ name, state: cond ? "ok" : "fail", kind, detail: cond ? "" : detail });
}
/** Registra un invariante que NO se ha podido evaluar. Nunca es "ok". */
function unchecked(name, reason) {
  results.push({ name, state: "unchecked", kind: KIND_AVAILABILITY, detail: reason });
}

/**
 * Clasifica el resultado del barrido. Pura y testeable: es la que decide qué
 * se cuenta por Telegram.
 */
export function classifyResults(list) {
  const moneyFails = list.filter((r) => r.state === "fail" && r.kind === KIND_MONEY);
  const availabilityFails = list.filter((r) => r.state === "fail" && r.kind === KIND_AVAILABILITY);
  const skipped = list.filter((r) => r.state === "unchecked");
  const oks = list.filter((r) => r.state === "ok");
  let severity = null;
  if (moneyFails.length > 0) severity = KIND_MONEY;
  else if (availabilityFails.length > 0 || skipped.length > 0) severity = KIND_AVAILABILITY;
  return { severity, moneyFails, availabilityFails, skipped, oks };
}

/** Texto del aviso de Telegram. Una sola línea (formato de GITHUB_OUTPUT). */
export function buildAlertText(classification, runUrl = "") {
  const { severity, moneyFails, availabilityFails, skipped } = classification;
  if (!severity) return "";
  const names = (arr) => arr.map((r) => r.name).join(" · ");
  let text;
  if (severity === KIND_MONEY) {
    text =
      "🚨 MONEY SMOKE FALLÓ — una invariante de dinero o de exposición de proveedor se rompió en producción. " +
      `Revisar YA: ${names(moneyFails)}`;
  } else {
    // Nada de dinero consta roto: lo que ha pasado es que no se ha podido mirar.
    const caidas = names(availabilityFails) || "—";
    text =
      "⚠️ MONEY SMOKE: una superficie pública no respondió, así que sus invariantes de dinero NO se han podido " +
      `comprobar (ninguna invariante rota confirmada). Caídas: ${caidas}. Sin comprobar: ${skipped.length}`;
  }
  if (runUrl) text += ` — ${runUrl}`;
  return text.replace(/[\r\n]+/g, " ").slice(0, 900);
}

/** Escribe la clasificación en GITHUB_OUTPUT para que el workflow elija el mensaje. */
function writeGithubOutput(classification, runUrl) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  const lines = [
    `severity=${classification.severity ?? "none"}`,
    `alert_text=${buildAlertText(classification, runUrl)}`,
  ];
  try {
    appendFileSync(out, lines.join("\n") + "\n");
  } catch {
    /* que un fallo de escritura no tape el resultado del smoke */
  }
}

/**
 * ¿El fallo prueba que la petición NUNCA llegó a salir? Mismo discriminante
 * verificado para los workflows de cron en 9128f96: solo se reintenta lo que
 * está probado que no se ejecutó. Un timeout DESPUÉS de conectar, o un 5xx,
 * significan que el servidor sí recibió la petición — y /api/recommend gasta
 * LLM de pago y tiene rate limit, así que repetirla sería trabajo duplicado.
 */
export function esFalloDeConexion(err) {
  const codes = ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"];
  const vistos = new Set();
  for (let e = err; e && !vistos.has(e); e = e.cause) {
    vistos.add(e);
    if (typeof e.code === "string" && codes.includes(e.code)) return true;
  }
  return false;
}

/**
 * fetch que no tumba el barrido entero. Antes, un parpadeo de red dejaba el
 * script en `main().catch` sin clasificar nada: el workflow caía al mensaje
 * genérico y volvía a anunciar "una invariante de dinero se rompió" cuando lo
 * único que había pasado es que no hubo conexión (visto en vivo el 29-jul
 * 18:16, y el mismo cuadro que tumbó el cron de Makito a las 05:31).
 */
async function safeFetch(url, opts, intentos = 3) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    const ms = timeoutParaIntento(deadline, Date.now());
    if (ms === 0) {
      // Sin presupuesto no se toca la red: se devuelve "no respondió" al
      // instante para que el barrido llegue a clasificar y a avisar.
      return { status: 0, text: async () => "", _networkError: "presupuesto de tiempo agotado" };
    }
    try {
      // El abort NO se reintenta a propósito: la petición SÍ salió, y repetir
      // /api/recommend gasta LLM de pago. `esFalloDeConexion` lo deja fuera
      // porque un AbortError/TimeoutError no trae `code` de conexión.
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      ultimo = e;
      if (!esFalloDeConexion(e) || i === intentos) break;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  // Superficie inalcanzable: status 0 → se trata como "no respondió".
  return { status: 0, text: async () => "", _networkError: ultimo?.message || String(ultimo) };
}

async function getJson(path, opts) {
  const r = await safeFetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-json */ }
  return { status: r.status, json, text };
}

async function main() {
  deadline = Date.now() + BUDGET_MS;

  // ── 1. Marcaje se cobra ──────────────────────────────────────────
  const bare = await getJson("/api/quote/calculate", {
    method: "POST",
    body: JSON.stringify({ productSlug: SLUG, quantity: 100 }),
  });
  const marked = await getJson("/api/quote/calculate", {
    method: "POST",
    body: JSON.stringify({ productSlug: SLUG, quantity: 100, techniqueCode: TECH, numberOfColours: 1, positionCount: 1 }),
  });
  const quoteRespondio = bare.status === 200 && marked.status === 200;
  check("quote/calculate responde", quoteRespondio, `status ${bare.status}/${marked.status}`, KIND_AVAILABILITY);
  if (!quoteRespondio) {
    // Sin respuesta no se puede afirmar nada del precio: no comprobado.
    const razon = `status ${bare.status}/${marked.status}`;
    unchecked("precio base > 0", razon);
    unchecked("el marcaje incrementa el precio (P0)", razon);
    unchecked("quote devuelve markings[] al pasar técnica (P0)", razon);
  } else {
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
  }

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
    // Superficies de CONTENIDO, no de producto. Se añaden el 13-ago tras
    // encontrarlas filtrando: llms.txt llegó a listar a los tres proveedores
    // por su nombre («productos de 3 proveedores europeos (…)») y es
    // justamente el fichero que los LLM leen y repiten; /docs/api enseñaba el
    // campo `midoceanOrderId` del contrato público; /privacidad los citaba
    // como destinatarios de datos. Ninguna devuelve productos, así que el
    // barrido anterior —pensado para fichas— no las miraba.
    { path: "/llms.txt" },
    { path: "/docs/api" },
    { path: "/privacidad" },
  ];
  for (const surface of publicSurfaces) {
    const { path, method = "GET", body } = surface;
    const r = await safeFetch(BASE + path, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const text = (await r.text()).toLowerCase();
    const respondio = r.status === 200;
    const motivo = r._networkError ? `sin conexión: ${r._networkError}` : `status ${r.status}`;
    check(`${method} ${path} responde`, respondio, motivo, KIND_AVAILABILITY);
    if (!respondio) {
      // Barrer el cuerpo de un 500 (o de un 429) no prueba que la superficie
      // esté limpia: prueba que no había cuerpo que barrer. Marcarlo ✓ era un
      // falso verde en un check de FUGA — el mismo patrón que ya mordió con
      // el índice de búsqueda. Ahora se registra como no comprobado.
      unchecked(`sin proveedor en ${method} ${path}`, r._networkError ? "no hubo conexión" : `superficie devolvió ${r.status}`);
      continue;
    }
    const leak = findLeak(text);
    check(`sin proveedor en ${method} ${path}`, !leak, leak ? `contiene "${leak}"` : "");
  }

  // ── 3. Tarjetas Diego: precio cliente + ref pública ──────────────
  const cards = await getJson(`/api/products/cards?slugs=${encodeURIComponent(SLUG)}`);
  if (cards.status !== 200) {
    const razon = `status ${cards.status}`;
    unchecked("tarjeta Diego existe", razon);
    unchecked("tarjeta con precio cliente > 0", razon);
    unchecked("tarjeta con ref pública STM-", razon);
  } else {
    const card = cards.json?.items?.[0];
    check("tarjeta Diego existe", !!card, `items=${cards.json?.items?.length}`);
    check("tarjeta con precio cliente > 0", typeof card?.priceFromCents === "number" && card.priceFromCents > 0, `price=${card?.priceFromCents}`);
    check("tarjeta con ref pública STM-", typeof card?.ref === "string" && card.ref.startsWith("STM-"), `ref=${card?.ref}`);
  }

  // ── 4. /comparar con precio real ─────────────────────────────────
  const cmp = await safeFetch(`${BASE}/comparar?slugs=${encodeURIComponent(SLUG)}`);
  const cmpBody = await cmp.text();
  if (cmp.status !== 200) {
    unchecked("/comparar muestra un precio con €", `status ${cmp.status}`);
  } else {
    check("/comparar muestra un precio con €", /\d+,\d{2}\s*€/.test(cmpBody), "no se encontró patrón de precio");
  }

  // ── Reporte ──────────────────────────────────────────────────────
  const classification = classifyResults(results);
  const { severity, moneyFails, availabilityFails, skipped, oks } = classification;
  console.log(`\n💰 Money smoke test contra ${BASE}\n`);
  for (const r of oks) console.log(`  ✓ ${r.name}`);
  for (const r of [...moneyFails, ...availabilityFails]) console.log(`  ✗ ${r.name}${r.detail ? " — " + r.detail : ""}`);
  for (const r of skipped) console.log(`  ⊘ ${r.name} — NO COMPROBADO (${r.detail})`);
  console.log(
    `\n${oks.length} ok, ${moneyFails.length} fallos de dinero/proveedor, ` +
      `${availabilityFails.length} superficies caídas, ${skipped.length} sin comprobar\n`,
  );

  const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";
  writeGithubOutput(classification, runUrl);

  if (severity === KIND_MONEY) {
    console.error("❌ INVARIANTE DE NEGOCIO ROTA — revisar cuanto antes.");
    process.exit(1);
  }
  if (severity === KIND_AVAILABILITY) {
    // Sigue siendo rojo: no se ha podido garantizar lo que este guard existe
    // para garantizar. Pero no se afirma una rotura que no consta.
    console.error("⚠️ SUPERFICIE PÚBLICA CAÍDA — invariantes de esa ruta SIN COMPROBAR.");
    process.exit(1);
  }
  console.log("✅ Todos los invariantes de dinero/proveedor OK.");
}

// Solo se ejecuta al invocarlo como script; importarlo (tests) no toca la red.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Error ejecutando el smoke test:", e);
    process.exit(1);
  });
}
