import { prisma } from "@/lib/prisma";
import { computeCotizacion } from "@/lib/cotizar-core";
import { notifyTelegram } from "@/lib/telegram";

/**
 * Inteligencia de competencia — 🔒 SOLO USO INTERNO.
 *
 * Para un producto nuestro: busca el producto equivalente en webs de
 * competidores españoles (DuckDuckGo lite `site:dominio <ref|nombre>` — muchos
 * revenden los mismos catálogos y exponen la ref del fabricante), extrae los
 * precios de la página con un LLM barato, los compara con NUESTRO PVP y margen
 * (computeCotizacion, la misma cascada del cotizador) y emite recomendación:
 * SUBIR / BAJAR / OK con objetivo concreto que respeta un margen mínimo.
 *
 * Config en AdminSetting (todas opcionales):
 *   competitor_sources   → ["dominio1.com", ...]      (default 3 nacionales)
 *   competitor_watchlist → ["STM-XXXXXX" | slug, ...] (se suma al top ventas)
 *
 * El cron semanal (competitor-watch) manda a Telegram SOLO lo accionable.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const EXTRACT_MODEL = process.env.OPENROUTER_MODEL_EXTRACT || "anthropic/claude-haiku-4.5";

/** Versión del motor — para saber desde el GET de estado qué código corre. */
export const INTEL_VERSION = "v4-tavily";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const DEFAULT_COMPETITORS = ["regalopublicidad.com", "maxilia.es", "camalon.es"];
const QTY_REF = 100; // cantidad de referencia para comparar
const MIN_MARGIN_PCT = 25; // nunca recomendar bajar por debajo de coste +25%
const BAND_PCT = 10; // banda de indiferencia ±10%

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmt = (cents: number) => EUR.format(cents / 100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Config ───────────────────────────────────────────────────────────────────

async function settingJson<T>(key: string): Promise<T | null> {
  const row = await prisma.adminSetting.findUnique({ where: { key } });
  return (row?.value as T) ?? null;
}

export async function competitorSources(): Promise<string[]> {
  const cfg = await settingJson<string[]>("competitor_sources");
  return Array.isArray(cfg) && cfg.length > 0 ? cfg : DEFAULT_COMPETITORS;
}

// ── Búsqueda + extracción ────────────────────────────────────────────────────

/** Busca en DDG lite y devuelve las primeras URLs del dominio (sin anuncios). */
async function ddgSearch(domain: string, query: string): Promise<string[]> {
  const q = encodeURIComponent(`site:${domain} ${query}`);
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${q}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const urls: string[] = [];
  for (const m of html.matchAll(/uddg=([^"&]{10,300})/g)) {
    try {
      const url = decodeURIComponent(m[1]);
      // Filtrar anuncios (y.js) y quedarnos solo con el dominio objetivo.
      if (url.includes("duckduckgo.com")) continue;
      if (!url.includes(domain)) continue;
      if (!urls.includes(url)) urls.push(url);
    } catch {
      /* URL malformada: ignorar */
    }
    if (urls.length >= 2) break;
  }
  return urls;
}

/** Fallback: búsqueda en Bing HTML (suele funcionar desde IPs de datacenter). */
async function bingSearch(domain: string, query: string): Promise<string[]> {
  const q = encodeURIComponent(`site:${domain} ${query}`);
  try {
    const res = await fetch(`https://www.bing.com/search?q=${q}&setlang=es`, {
      headers: { "User-Agent": UA, "Accept-Language": "es-ES,es" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const urls: string[] = [];
    for (const m of html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/g)) {
      const url = m[1];
      if (!url.includes(domain) || url.includes("bing.com")) continue;
      if (!urls.includes(url)) urls.push(url);
      if (urls.length >= 2) break;
    }
    return urls;
  } catch {
    return [];
  }
}

/** Búsqueda vía API de Tavily — el ÚNICO camino fiable desde IPs de
 *  datacenter (DDG y Bing scrapeados capan tanto el VPS como los runners de
 *  GH, verificado 2026-07-11). Sin TAVILY_API_KEY devuelve vacío y se cae a
 *  los motores scrapeados (que funcionan solo desde IP residencial). */
async function tavilySearch(domain: string, query: string): Promise<string[]> {
  if (!TAVILY_API_KEY) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        include_domains: [domain],
        max_results: 3,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[competitor-intel] tavily", res.status);
      return [];
    }
    const json = (await res.json()) as { results?: { url?: string }[] };
    return (json.results ?? [])
      .map((r) => r.url)
      .filter((u): u is string => typeof u === "string" && u.includes(domain))
      .slice(0, 2);
  } catch (e) {
    console.error("[competitor-intel] tavily", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Orden: Tavily (API, fiable) → DDG lite → Bing (scrapeados, solo IP residencial). */
async function searchCompetitor(
  domain: string,
  query: string,
): Promise<{ urls: string[]; engine: "tavily" | "ddg" | "bing" | "none" }> {
  let urls = await tavilySearch(domain, query);
  if (urls.length > 0) return { urls, engine: "tavily" };
  urls = await ddgSearch(domain, query);
  if (urls.length > 0) return { urls, engine: "ddg" };
  await sleep(1500);
  urls = await bingSearch(domain, query);
  return { urls, engine: urls.length > 0 ? "bing" : "none" };
}

/** Descarga una página; devuelve texto plano para el LLM y el HTML crudo
 *  (para poder extraer enlaces si resulta ser una categoría/listado). */
async function fetchPage(
  url: string,
  maxChars = 24_000,
): Promise<{ text: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es-ES,es" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&quot;|&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { text: text.slice(0, maxChars), html };
  } catch {
    return null;
  }
}

/** Del HTML de una categoría/listado, el enlace interno que MÁS se parece al
 *  producto (solape de tokens del nombre/ref en href+anchor). Segundo salto
 *  cuando la búsqueda aterriza en un listado sin precios extraíbles. */
function bestProductLink(
  html: string,
  domain: string,
  productName: string,
  supplierRef: string,
): string | null {
  const tokens = productName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  const refLower = supplierRef.toLowerCase();
  let best: { url: string; score: number } | null = null;
  for (const m of html.matchAll(/<a[^>]+href="([^"#?]+)[^"]*"[^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    let href = m[1];
    if (href.startsWith("/")) href = `https://${domain.replace(/^www\./, "www.")}${href}`;
    if (!href.includes(domain.replace(/^www\./, ""))) continue;
    const hay = (href + " " + m[2].replace(/<[^>]+>/g, " ")).toLowerCase();
    let score = 0;
    if (refLower.length >= 4 && hay.includes(refLower)) score += 10;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (score >= 2 && (!best || score > best.score)) best = { url: href, score };
  }
  return best?.url ?? null;
}

export type CompetitorHit = {
  competitor: string;
  url: string;
  productName: string | null;
  matches: boolean;
  confidence: number;
  prices: { qty: number; unitEur: number; conMarcaje: boolean; tecnica: string | null }[];
};

/** Extrae precios de la página del competidor con un LLM barato (JSON). */
async function llmExtract(
  pageText: string,
  ourProductName: string,
  url: string,
  competitor: string,
): Promise<CompetitorHit | null> {
  if (!OPENROUTER_API_KEY) return null;
  const prompt = `Página de una tienda de merchandising promocional (texto plano):
---
${pageText}
---
Nuestro producto: "${ourProductName}".

Devuelve SOLO un JSON (sin markdown) con este shape:
{"encontrado":bool,            // ¿la página muestra un producto concreto con precio?
 "nombre_producto":string|null,
 "coincide":bool,              // ¿es el MISMO producto o uno claramente equivalente al nuestro?
 "confianza":number,           // 0-1
 "precios":[{"qty":number,"unit_eur":number,"con_marcaje":bool,"tecnica":string|null}]}
Reglas: precios UNITARIOS en euros; si hay tabla por cantidades incluye hasta 4 tramos; con_marcaje=true solo si el precio incluye impresión/marcaje; si es una página de categoría/listado usa el producto más parecido al nuestro y baja la confianza.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      encontrado?: boolean;
      nombre_producto?: string | null;
      coincide?: boolean;
      confianza?: number;
      precios?: { qty?: number; unit_eur?: number; con_marcaje?: boolean; tecnica?: string | null }[];
    };
    if (!parsed.encontrado) return null;
    const prices = (parsed.precios ?? [])
      .filter((p) => typeof p.unit_eur === "number" && p.unit_eur! > 0)
      .map((p) => ({
        qty: Math.max(1, Math.trunc(p.qty ?? 1)),
        unitEur: p.unit_eur!,
        conMarcaje: Boolean(p.con_marcaje),
        tecnica: p.tecnica ?? null,
      }));
    if (prices.length === 0) return null;
    return {
      competitor,
      url,
      productName: parsed.nombre_producto ?? null,
      matches: Boolean(parsed.coincide),
      confidence: Math.max(0, Math.min(1, parsed.confianza ?? 0)),
      prices,
    };
  } catch {
    return null;
  }
}

/** El precio del competidor al tramo más cercano a `qty` (prefiere con marcaje). */
function pickCompetitorUnit(hit: CompetitorHit, qty: number, conMarcaje: boolean) {
  const pool = hit.prices.filter((p) => p.conMarcaje === conMarcaje);
  const list = pool.length > 0 ? pool : hit.prices;
  return list.reduce((best, p) =>
    Math.abs(p.qty - qty) < Math.abs(best.qty - qty) ? p : best,
  );
}

// ── Análisis por producto ────────────────────────────────────────────────────

export type CompetitorAnalysis = {
  producto: string;
  ref: string;
  qty: number;
  nuestro: {
    pvp_unit: string;
    con_marcaje: boolean;
    tecnica: string | null;
    margen_pct: string;
  };
  competidores: {
    dominio: string;
    unit: string;
    qty: number;
    con_marcaje: boolean;
    confianza: number;
    url: string;
  }[];
  recomendacion: {
    accion: "SUBIR" | "BAJAR" | "OK" | "SIN_DATOS";
    detalle: string;
    objetivo_unit?: string;
  };
  /** Diagnóstico por competidor (via_ddg/via_bing/busqueda_sin_resultados/…). */
  debug: Record<string, string>;
};

/** Resuelve la técnica más común (isDefault > más posiciones) para comparar con marcaje. */
async function commonTechniqueCode(productId: string): Promise<string | null> {
  const positions = await prisma.markingPosition.findMany({
    where: { productId },
    include: { techniques: { include: { technique: { select: { code: true } } } } },
  });
  const counts = new Map<string, { n: number; isDefault: boolean }>();
  for (const pos of positions) {
    for (const t of pos.techniques) {
      const cur = counts.get(t.technique.code) ?? { n: 0, isDefault: false };
      cur.n += 1;
      cur.isDefault = cur.isDefault || t.isDefault;
      counts.set(t.technique.code, cur);
    }
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => Number(b[1].isDefault) - Number(a[1].isDefault) || b[1].n - a[1].n,
  );
  return ranked[0]?.[0] ?? null;
}

export async function analyzeCompetitorsForProduct(
  refOrSlug: string,
  qty: number = QTY_REF,
): Promise<CompetitorAnalysis | { error: string }> {
  const q = refOrSlug.trim();
  const product = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [
        { internalRef: { equals: q, mode: "insensitive" } },
        { slug: q.toLowerCase() },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true, internalRef: true, supplierRef: true },
  });
  if (!product) return { error: "Producto no encontrado" };

  // NUESTRO lado: PVP con la técnica más común (o sin marcaje si no hay).
  const techniqueCode = await commonTechniqueCode(product.id);
  const quote = await computeCotizacion({
    ref: product.slug,
    qty,
    techniqueCode: techniqueCode ?? undefined,
  });
  if (!quote.ok) return { error: `Nuestro producto no cotiza: ${quote.error}` };
  const ourUnitCents = quote.pvp.unit;
  const conMarcaje = Boolean(techniqueCode);

  // Competidores: buscar por ref del fabricante (muchos la exponen) y si no,
  // por nombre. La supplierRef SOLO se usa como término de búsqueda interna.
  const sources = await competitorSources();
  const hits: CompetitorHit[] = [];
  const debug: Record<string, string> = {};
  for (const domain of sources) {
    let found = await searchCompetitor(domain, product.supplierRef);
    await sleep(2500);
    if (found.urls.length === 0) {
      found = await searchCompetitor(domain, product.name.toLowerCase().slice(0, 60));
      await sleep(2500);
    }
    if (found.urls.length === 0) {
      debug[domain] = "busqueda_sin_resultados";
      continue;
    }
    debug[domain] = `via_${found.engine}`;
    for (const url of found.urls.slice(0, 1)) {
      const page = await fetchPage(url);
      if (!page) {
        debug[domain] = "pagina_no_descarga";
        continue;
      }
      let finalUrl = url;
      let hit = await llmExtract(page.text, product.name, finalUrl, domain);
      // 2º salto: la búsqueda suele aterrizar en un LISTADO/categoría sin
      // precios claros → seguimos el enlace interno más parecido al producto.
      if (!hit || hit.confidence < 0.4) {
        const link = bestProductLink(page.html, domain, product.name, product.supplierRef);
        if (link && link !== url) {
          await sleep(1500);
          const page2 = await fetchPage(link);
          if (page2) {
            const hit2 = await llmExtract(page2.text, product.name, link, domain);
            if (hit2 && (!hit || hit2.confidence > hit.confidence)) {
              hit = hit2;
              finalUrl = link;
              debug[domain] = `via_${found.engine}+2salto`;
            }
          }
        }
      }
      if (!hit) debug[domain] = "sin_precios_extraibles";
      else if (hit.confidence < 0.4) debug[domain] = "confianza_baja";
      if (hit && hit.confidence >= 0.4) {
        hits.push(hit);
        // Persistir histórico (mejor tramo cercano a qty).
        const p = pickCompetitorUnit(hit, qty, conMarcaje);
        await prisma.competitorPrice
          .create({
            data: {
              productId: product.id,
              competitor: domain,
              url: finalUrl,
              qty: p.qty,
              unitPriceCents: Math.round(p.unitEur * 100),
              includesMarking: p.conMarcaje,
              technique: p.tecnica,
              matchConfidence: hit.confidence,
            },
          })
          .catch((e) =>
            console.error("[competitor-intel] persistir falló:", e instanceof Error ? e.message : e),
          );
      }
    }
  }

  // Recomendación sobre el MEJOR precio rival comparable.
  const comparables = hits
    .filter((h) => h.matches)
    .map((h) => ({ h, p: pickCompetitorUnit(h, qty, conMarcaje) }));
  let recomendacion: CompetitorAnalysis["recomendacion"];
  if (comparables.length === 0) {
    recomendacion = {
      accion: "SIN_DATOS",
      detalle: hits.length > 0
        ? "Se encontraron páginas pero ninguna con coincidencia clara de producto."
        : "Ningún competidor configurado muestra este producto (o la búsqueda no lo encontró).",
    };
  } else {
    const best = comparables.reduce((a, b) => (a.p.unitEur < b.p.unitEur ? a : b));
    const rivalCents = Math.round(best.p.unitEur * 100);
    const costUnitCents = Math.round(quote.coste.total / Math.max(1, qty));
    const floorCents = Math.round(costUnitCents * (1 + MIN_MARGIN_PCT / 100));
    if (ourUnitCents > rivalCents * (1 + BAND_PCT / 100)) {
      const target = Math.max(Math.round(rivalCents * 0.98), floorCents);
      recomendacion =
        target < ourUnitCents
          ? {
              accion: "BAJAR",
              detalle: `${best.h.competitor} vende a ${fmt(rivalCents)}/ud (nosotros ${fmt(ourUnitCents)}). Bajando a ${fmt(target)} seguimos por encima de coste +${MIN_MARGIN_PCT}%.`,
              objetivo_unit: fmt(target),
            }
          : {
              accion: "OK",
              detalle: `${best.h.competitor} vende más barato (${fmt(rivalCents)}), pero igualarlo rompería el margen mínimo — no bajar; competir por servicio/plazo.`,
            };
    } else if (ourUnitCents < rivalCents * (1 - BAND_PCT / 100)) {
      const target = Math.round(rivalCents * 0.95);
      recomendacion = {
        accion: "SUBIR",
        detalle: `Estamos ${fmt(rivalCents - ourUnitCents)}/ud por debajo del rival más barato (${best.h.competitor}, ${fmt(rivalCents)}). Subiendo a ${fmt(target)} seguimos ganando en precio y capturamos ~${fmt((target - ourUnitCents) * qty)} más por pedido de ${qty}.`,
        objetivo_unit: fmt(target),
      };
    } else {
      recomendacion = {
        accion: "OK",
        detalle: `En banda competitiva (±${BAND_PCT}%) frente a ${best.h.competitor} (${fmt(rivalCents)}/ud).`,
      };
    }
  }

  return {
    producto: product.name,
    ref: product.internalRef ?? product.slug,
    qty,
    nuestro: {
      pvp_unit: fmt(ourUnitCents),
      con_marcaje: conMarcaje,
      tecnica: quote.marking?.techniqueLabel ?? null,
      margen_pct: `${quote.margenEfectivoPct.toFixed(1)}%`,
    },
    competidores: comparables.map(({ h, p }) => ({
      dominio: h.competitor,
      unit: fmt(Math.round(p.unitEur * 100)),
      qty: p.qty,
      con_marcaje: p.conMarcaje,
      confianza: Math.round(h.confidence * 100) / 100,
      url: h.url,
    })),
    recomendacion,
    debug,
  };
}

// ── Cron semanal ─────────────────────────────────────────────────────────────

/** Watchlist: refs forzadas en AdminSetting + top productos cotizados 120d.
 *  Solo slugs que sigan siendo productos ACTIVOS (los carritos de prueba y
 *  productos retirados contaminaban la lista — visto en el primer run real). */
export async function buildWatchlist(limit: number): Promise<string[]> {
  const forced = (await settingJson<string[]>("competitor_watchlist")) ?? [];
  const since = new Date(Date.now() - 120 * 86400_000);
  const top = await prisma.cartQuoteItem.groupBy({
    by: ["productSlug"],
    where: { cart: { createdAt: { gte: since } } },
    _count: { productSlug: true },
    orderBy: { _count: { productSlug: "desc" } },
    take: limit * 4, // margen: parte serán tests/retirados
  });
  const existing = await prisma.product.findMany({
    where: { slug: { in: top.map((t) => t.productSlug) }, active: true },
    select: { slug: true },
  });
  const activeSlugs = new Set(existing.map((p) => p.slug));
  const list = [...forced];
  for (const t of top) {
    if (list.length >= limit + forced.length) break;
    if (activeSlugs.has(t.productSlug) && !list.includes(t.productSlug)) list.push(t.productSlug);
  }
  return list.slice(0, Math.max(limit, forced.length));
}

export async function runCompetitorWatch(limit = 8): Promise<{
  analizados: number;
  accionables: number;
  resumen: string[];
}> {
  const watchlist = await buildWatchlist(limit);
  const lines: string[] = [];
  const detalle: { ref: string; accion: string; debug: Record<string, string> }[] = [];
  let accionables = 0;
  let analizados = 0;
  let conDatos = 0;

  for (const ref of watchlist) {
    try {
      const a = await analyzeCompetitorsForProduct(ref);
      if ("error" in a) {
        detalle.push({ ref, accion: "ERROR", debug: { error: a.error } });
        continue;
      }
      analizados++;
      if (a.competidores.length > 0) conDatos++;
      detalle.push({ ref: a.ref, accion: a.recomendacion.accion, debug: a.debug });
      if (a.recomendacion.accion === "SUBIR" || a.recomendacion.accion === "BAJAR") {
        accionables++;
        lines.push(
          `${a.recomendacion.accion === "SUBIR" ? "📈 SUBIR" : "📉 BAJAR"} <b>${a.producto}</b> (${a.ref})\n` +
            `  nuestro ${a.nuestro.pvp_unit}/ud (margen ${a.nuestro.margen_pct}) · ${a.recomendacion.detalle}`,
        );
      }
    } catch (e) {
      console.error("[competitor-watch]", ref, e instanceof Error ? e.message : e);
      detalle.push({ ref, accion: "EXCEPTION", debug: { error: e instanceof Error ? e.message : String(e) } });
    }
    await sleep(3000); // pacing entre productos (educado con buscadores y rivales)
  }

  await prisma.adminSetting.upsert({
    where: { key: "competitor_watch_last" },
    create: {
      key: "competitor_watch_last",
      value: { at: new Date().toISOString(), analizados, accionables, conDatos, detalle },
    },
    update: {
      value: { at: new Date().toISOString(), analizados, accionables, conDatos, detalle },
    },
  });

  if (lines.length > 0) {
    await notifyTelegram(
      `🕵️ <b>Vigilancia de competencia</b> — ${accionables} recomendación${accionables === 1 ? "" : "es"} de precio:\n\n` +
        lines.join("\n\n") +
        `\n\n🔒 Interno. Cambiar precio: dime "pon <ref> a X €" o /admin.`,
    );
  } else if (conDatos > 0) {
    await notifyTelegram(
      `🕵️ Vigilancia de competencia: ${analizados} productos revisados (${conDatos} con datos de rivales), precios en banda competitiva. Sin acciones.`,
    );
  } else {
    await notifyTelegram(
      `🕵️ Vigilancia de competencia: ${analizados} productos revisados pero SIN datos de rivales (búsqueda bloqueada o productos no encontrados en los competidores configurados). Revisar diagnóstico interno.`,
    );
  }

  return { analizados, accionables, resumen: lines };
}
