/**
 * Generador de sugerencias accionables con IA (OpenRouter / Claude).
 *
 * Toma el estado actual del catálogo, funnel y top productos y devuelve
 * 3-5 acciones concretas en lenguaje natural que el admin puede tomar
 * esta semana. Complementa las sugerencias hardcoded del módulo
 * principal — no las reemplaza.
 *
 * Cache in-process TTL 6h para no quemar tokens (re-calcular en cada
 * pageview sería ~5k tokens × N visitas = caro y lento).
 */
import {
  getCatalogHealth,
  getConversionFunnel,
  getTopViewedProducts,
  getTopCategories,
  getTopSearchQueries,
  getSearchQueriesNoResults,
  getOverpricedProducts,
  getSupplierStatuses,
} from ".";

export type AISuggestion = {
  title: string;
  body: string;
  category: string; // "catálogo" | "marketing" | "precio" | "ux" | "otros"
};

type CacheEntry = { at: number; data: AISuggestion[]; promptHash: string };
let CACHE: CacheEntry | null = null;
const TTL_MS = 6 * 3600_000; // 6 horas

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

export async function getAISuggestions(): Promise<AISuggestion[]> {
  if (CACHE && Date.now() - CACHE.at < TTL_MS) {
    return CACHE.data;
  }
  if (!OPENROUTER_KEY) return [];

  // Recopilar contexto compacto (~1000 tokens)
  const [
    health,
    funnel,
    top,
    categories,
    topSearches,
    noResults,
    overpriced,
    suppliers,
  ] = await Promise.all([
    getCatalogHealth(),
    getConversionFunnel(),
    getTopViewedProducts(10, "30d"),
    getTopCategories(8),
    getTopSearchQueries(10, "30d").catch(() => []),
    getSearchQueriesNoResults(10, "30d").catch(() => []),
    getOverpricedProducts(5).catch(() => []),
    getSupplierStatuses(),
  ]);

  const ctx = {
    salud_catalogo: {
      productos_activos: health.activeProducts,
      variantes: health.totalVariants,
      pct_con_stock: health.pctStock,
      pct_con_imagen: health.pctImage,
      pct_descripcion_ia: health.pctEnhanced,
    },
    conversion_30d: {
      views: funnel.views30d,
      cart_adds: funnel.cartAdds30d,
      consultas_recomendador: funnel.recommenderQueries30d,
      propuestas: funnel.proposals30d,
      pct_view_to_cart: funnel.cartConvPct,
      pct_cart_to_proposal: funnel.proposalConvPct,
    },
    top_productos: top.slice(0, 8).map((p) => ({
      slug: p.slug,
      views: p.view30d,
      cart_adds: p.cartAddCount,
      propuestas: p.proposalCount,
      tiene_imagen: !!p.primaryImageUrl,
    })),
    top_categorias: categories.slice(0, 6).map((c) => ({
      nombre: c.categoryName,
      productos: c.products,
      views: c.views30d,
      cart_adds: c.cartAdds30d,
    })),
    top_busquedas: topSearches.slice(0, 8).map((s) => ({
      query: s.query,
      hits: s.count,
      resultados_media: s.resultsAvg,
    })),
    busquedas_sin_resultados: noResults.slice(0, 6).map((s) => ({
      query: s.query,
      hits: s.count,
    })),
    precios_anomalos: overpriced.slice(0, 5).map((p) => ({
      producto: p.name.slice(0, 50),
      precio_eur: p.minPriceCents / 100,
      mediana_categoria_eur: p.categoryMedianCents / 100,
      multiplicador: p.multiple,
    })),
    proveedores: suppliers.map((s) => ({
      nombre: s.supplier,
      productos: s.activeProducts,
      pct_con_stock: s.pctStock,
      horas_desde_ultima_sync: s.hoursStaleStock,
    })),
  };

  const promptHash = JSON.stringify(ctx).slice(0, 100);
  if (CACHE && CACHE.promptHash === promptHash) {
    CACHE.at = Date.now();
    return CACHE.data;
  }

  const prompt = `Eres un CRO/analista senior de un catálogo B2B de merchandising corporativo (España). Te paso métricas reales del último mes. Devuelve 3-5 acciones concretas que el admin puede tomar ESTA SEMANA para vender más, en JSON estricto.

CONTEXTO:
${JSON.stringify(ctx, null, 2)}

REGLAS:
- Sé específico. No "mejora el SEO" — di QUÉ producto/categoría y CÓMO.
- Cita números reales del contexto en cada acción (ej. "el producto X tiene 47 views pero 0 cart").
- Prioriza acciones con ROI alto a corto plazo (24-72h).
- Idioma: español de España, tono directo y profesional sin marketing-speak.
- Cada acción ≤80 palabras, sin emojis, sin bullets dentro del body.
- Si no encuentras nada accionable, devuelve menos de 5 (mejor 3 buenas que 5 mediocres).

FORMATO de respuesta (JSON estricto, SIN markdown, SIN texto extra antes/después):
{"suggestions": [
  {"title": "...", "body": "...", "category": "catálogo|marketing|precio|ux|otros"},
  ...
]}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://merchandising.hubstartidea.es",
        "X-Title": "TodoMerch Insights",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      console.error("[ai-suggestions] OpenRouter", response.status);
      return CACHE?.data ?? [];
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    const suggestions: AISuggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 5)
      : [];
    CACHE = { at: Date.now(), data: suggestions, promptHash };
    return suggestions;
  } catch (err) {
    console.error("[ai-suggestions]", err);
    return CACHE?.data ?? [];
  }
}
