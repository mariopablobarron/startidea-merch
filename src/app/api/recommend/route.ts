import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureError } from "@/lib/insights/capture-error";
import { rateLimit } from "@/lib/rate-limit";
import { publicRef } from "@/lib/internal-ref";
import { proxyImageUrl } from "@/lib/proxy-image";
import { defaultTiersFromBase, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { legacyHtmlToText, normalizeProductName, publicProductName } from "@/lib/product-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Recomendador IA — recibe brief libre + filtros opcionales y devuelve
 * 3-5 productos del catálogo con justificación.
 *
 * Usa OpenRouter como gateway hacia el modelo configurado (default Claude
 * Sonnet 4.5 vía openrouter). Permite cambiar de proveedor sin tocar código.
 *
 * Si OPENROUTER_API_KEY no está configurada, devuelve 503 con mensaje claro.
 */

const Schema = z.object({
  brief: z.string().min(20).max(2000),
  budget: z.number().int().positive().max(1_000_000).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  preferredCategories: z.array(z.string()).max(8).optional(),
  ecoOnly: z.boolean().optional(),
  // Conversación: turnos previos (brief inicial + resúmenes del asistente) y
  // el nuevo mensaje del cliente. Con followUp presente, el último mensaje al
  // modelo es ese texto (el brief original viaja dentro de history). Capado
  // corto: es contexto, no un segundo brief.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1500),
      }),
    )
    .max(10)
    .optional(),
  followUp: z.string().min(1).max(1000).optional(),
});

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export async function POST(req: Request) {
  // Estricto: cada llamada dispara un LLM (coste real + CPU). 10 usos/5 min
  // por IP sobran para un visitante legítimo del recomendador.
  const rl = rateLimit(req, { key: "recommend", max: 10, windowMs: 5 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { brief, budget, quantity, preferredCategories, ecoOnly, history, followUp } = parsed.data;

  // Degradación elegante: el cliente NUNCA ve un error técnico. Si la IA no
  // está disponible (sin key, red caída, proveedor con 5xx/429 tras retries),
  // le llevamos al catálogo filtrado por su brief y avisamos al admin.
  const gracefulFallback = (reason: string, err?: unknown) => {
    captureError(err instanceof Error ? err : new Error(reason), {
      context: "api/recommend/ai-unavailable",
      severity: "error",
      notifyAdmin: true,
    });
    void prisma.recommenderQuery
      .create({
        data: {
          brief,
          budget: budget ?? null,
          quantity: quantity ?? null,
          ecoOnly: !!ecoOnly,
          needsClarification: false,
          fallback: true,
          recommendedSlugs: [],
          summary: `[fallback] ${reason}`.slice(0, 500),
          mode: "recommend",
        },
      })
      .catch((e) =>
        console.error("[recommend] persistir recommenderQuery fallback falló:", e instanceof Error ? e.message : e),
      );
    const keywords = extractKeywords(brief);
    return NextResponse.json(
      {
        ok: true,
        fallback: true,
        summary:
          "Ahora mismo no puedo afinar recomendaciones personalizadas, así que te llevo al catálogo ya filtrado con lo que has descrito. Si lo prefieres, pídenos cotización y te respondemos en 24 h.",
        redirectUrl: keywords ? `/catalogo?q=${encodeURIComponent(keywords)}` : "/catalogo",
        recommendations: [],
      },
      { status: 200 },
    );
  };

  if (!OPENROUTER_KEY) {
    return gracefulFallback("OPENROUTER_API_KEY no configurada");
  }

  // 1) Snapshot del catálogo: top 250 productos relevantes
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(ecoOnly
        ? {
            OR: [
              { material: { contains: "bambú", mode: "insensitive" } },
              { material: { contains: "rpet", mode: "insensitive" } },
              { material: { contains: "orgán", mode: "insensitive" } },
              { material: { contains: "recic", mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ syncedAt: "desc" }],
    take: 500,
    select: {
      slug: true,
      id: true, internalRef: true,
      name: true,
      brand: true,
      shortDescription: true,
      enhancedShortDescription: true,
      material: true,
      category: { select: { name: true } },
      variants: { take: 1, select: { stockQty: true } },
    },
  });

  const catalogBlock = products
    .map(
      (p, i) =>
        `[${i + 1}] ${normalizeProductName(p.name)} · ref ${publicRef(p)} · ${p.category?.name || "—"} · ${legacyHtmlToText(p.material) || "—"} · stock ${p.variants[0]?.stockQty ?? 0} · slug=${p.slug}\n   ${legacyHtmlToText(p.enhancedShortDescription || p.shortDescription)}`,
    )
    .join("\n");

  const systemPrompt = `Eres un consultor B2B de merchandising corporativo en español. Tu trabajo es leer un brief de cliente y, según el tipo de brief, devolver UNO de estos dos formatos JSON:

CASO A — BRIEF EXPLORATORIO (ej. "quiero merchandising para mi feria tech, 100 unidades, 1000 €")
→ Modo recomendación: sugieres 3-5 productos del catálogo.

CASO B — BRIEF DE COTIZACIÓN MULTI-ITEM (ej. "necesito X polos, Y toallas, Z bolígrafos")
→ Modo cotización: detectas CADA item separado con su cantidad, técnica de marcaje y posibles tallas, y eliges el producto del catálogo que mejor encaja con cada uno.

Reglas estrictas:
1. SOLO recomiendas productos que aparecen en el catálogo proporcionado (usa el slug exacto). No inventes referencias.
2. Para términos genéricos, busca sinónimos en el catálogo. Ej: "toalla microfibra" puede aparecer como "toalla deportiva", "toalla gym", "microfibra sport". Para "polo hombre/mujer", busca polos con info de género.
3. Si en el catálogo NO hay nada que encaje con un item de cotización, marca ese item con notFound:true y describe qué buscaste.
4. Detecta técnica de marcaje del brief: "serigrafía", "serigrafiado", "bordado", "bordada", "láser", "DTF", "tampografía", "impreso", "grabado". Si no se menciona, deja technique:null.
5. Detecta tallas y reparto: "20 talla M, 20 L, 20 XL" → sizes:{ M:20, L:20, XL:20 }. Cantidad TOTAL del item = suma de tallas.
6. Detecta colores del brief.
7. Tono cercano, español de España, tuteo.
8. Responde SOLO con JSON válido. Sin markdown, sin comentarios fuera del JSON.

FORMATO JSON modo CASO A (recomendación):
{
  "mode": "recommend",
  "needsClarification": false,
  "clarificationQuestion": null,
  "recommendations": [
    { "slug": "<slug>", "rationale": "<2 frases>" }
  ],
  "summary": "<frase comercial cierre>"
}

FORMATO JSON modo CASO B (cotización):
{
  "mode": "quote",
  "needsClarification": false,
  "clarificationQuestion": null,
  "quoteItems": [
    {
      "description": "<lo que pide el cliente, tal cual>",
      "slug": "<slug del producto que mejor encaja, o null si notFound>",
      "notFound": false,
      "searchedAs": "<términos que probaste si notFound>",
      "quantity": <int total>,
      "sizes": { "S": 15, "M": 15, ... } | null,
      "technique": "serigrafia" | "bordado" | "laser" | "dtf" | "tampografia" | null,
      "colorRequested": "<color que pide el cliente, opcional>",
      "rationale": "<por qué este producto encaja con el item, 1 frase>"
    }
  ],
  "summary": "<frase comercial 1 línea, ej: Te calculo precios y total estimado abajo.>"
}

Si needsClarification=true, ambos arrays vacíos y clarificationQuestion contiene la pregunta única.`;

  const userPrompt = `Brief del cliente:
"""
${brief}
"""${budget ? `\n\nPresupuesto orientativo: ${budget} €` : ""}${quantity ? `\n\nCantidad estimada: ${quantity} unidades` : ""}${preferredCategories?.length ? `\n\nCategorías preferidas: ${preferredCategories.join(", ")}` : ""}${ecoOnly ? "\n\nFiltro: SOLO productos eco/sostenibles." : ""}

INSTRUCCIONES DE PROCESADO:
1. ¿Es un brief multi-item (lista de productos con cantidades específicas)? → CASO B mode="quote"
2. ¿Es un brief exploratorio o de búsqueda? → CASO A mode="recommend"
3. Para cada item busca con SINÓNIMOS si no encuentras coincidencia directa.

Devuelve SOLO el JSON descrito.`;

  // Seguimiento de conversación: el cliente responde a una aclaración o pide
  // ajustes sobre las recomendaciones ya dadas. El hilo previo viaja en
  // history; el último mensaje es SOLO el texto nuevo.
  const followUpPrompt = followUp
    ? `El cliente CONTINÚA la conversación anterior. Su nuevo mensaje:
"""
${followUp}
"""

Ajusta tu respuesta según este mensaje (afinar productos, responder a tu pregunta de aclaración, cambiar presupuesto/cantidad/estilo…). Mantén las INSTRUCCIONES DE PROCESADO del brief original. Devuelve SOLO el JSON descrito, mismo formato.`
    : null;

  // 2) Llamada al gateway de IA (formato OpenAI-compatible) con reintento.
  // Errores transitorios (red, 429, 5xx) se reintentan una vez; si aun así
  // falla, degradamos al catálogo filtrado — nunca un error técnico al cliente.
  const aiPayload = JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `CATÁLOGO DISPONIBLE (${products.length} productos):\n\n${catalogBlock}`,
      },
      ...(followUpPrompt && history?.length
        ? history.map((m) => ({ role: m.role, content: m.content }))
        : []),
      { role: "user", content: followUpPrompt ?? userPrompt },
    ],
  });

  let response: Response | null = null;
  let lastFailure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": SITE_URL,
          "X-Title": "TodoMerchandising",
        },
        body: aiPayload,
        signal: AbortSignal.timeout(attempt === 1 ? 12_000 : 14_000),
      });
      if (r.ok) {
        response = r;
        break;
      }
      const detail = await r.text().catch(() => "");
      lastFailure = `gateway HTTP ${r.status}: ${detail.slice(0, 300)}`;
      // 4xx no transitorios (key inválida, payload) no merecen reintento
      if (r.status < 429 || (r.status > 429 && r.status < 500)) break;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : String(err);
    }
    if (attempt === 1) await new Promise((res) => setTimeout(res, 800));
  }

  if (!response) {
    return gracefulFallback(`IA no disponible tras 2 intentos — ${lastFailure}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: Record<string, number>;
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content || "";

  type QuoteItemAi = {
    description: string;
    slug: string | null;
    notFound?: boolean;
    searchedAs?: string;
    quantity: number;
    sizes?: Record<string, number> | null;
    technique?: string | null;
    colorRequested?: string | null;
    rationale?: string;
  };
  let parsedRec: {
    mode?: "recommend" | "quote";
    needsClarification?: boolean;
    clarificationQuestion?: string | null;
    recommendations?: Array<{ slug: string; ref?: string; name?: string; rationale?: string }>;
    quoteItems?: QuoteItemAi[];
    summary?: string;
  };
  // Parser tolerante: algunos modelos devuelven el JSON envuelto en
  // ```json ... ```, con texto antes/después, o con caracteres de control.
  const tryParsed = tryParseJson(text);
  if (!tryParsed) {
    // Fallback: redirige al catálogo filtrado con palabras clave del brief
    // del usuario en lugar de mostrar error técnico al cliente.
    const keywords = extractKeywords(brief);
    return NextResponse.json(
      {
        ok: true,
        fallback: true,
        summary:
          "Te llevo al catálogo filtrado por lo que has descrito para que sigas explorando ahí.",
        redirectUrl: keywords ? `/catalogo?q=${encodeURIComponent(keywords)}` : "/catalogo",
        recommendations: [],
      },
      { status: 200 },
    );
  }
  parsedRec = tryParsed;

  // 3) Enriquecer con datos reales del producto desde DB
  const enriched = await Promise.all(
    (parsedRec.recommendations || []).map(async (r) => {
      const p = await prisma.product.findUnique({
        where: { slug: r.slug },
        select: {
          slug: true,
          name: true,
          id: true, internalRef: true,
          primaryImageUrl: true,
          category: { select: { name: true } },
          override: { select: { customName: true } },
        },
      });
      if (!p) return null;
      return {
        slug: p.slug,
        name: publicProductName(p.name, p.override?.customName),
        ref: publicRef(p), // NUNCA supplierRef en endpoint público
        category: p.category?.name,
        // NUNCA la URL cruda del CDN: delata al proveedor (MidOcean guarda la
        // original en BD, a diferencia de Cifra/Makito/Adivin). Idempotente.
        primaryImageUrl: proxyImageUrl(p.primaryImageUrl),
        url: `/catalogo/${p.slug}`,
        rationale: r.rationale || "",
      };
    }),
  );

  // 3b) Enriquecer quoteItems con producto real + cálculo de precio.
  // Para cada item: si tiene slug, busca producto y calcula precio real con
  // PriceTier si existe, o estimación si no. Marcaje añade setup + por ud.
  // Tarifas ORIENTATIVAS de marcaje a nivel cliente (el importe real lo
  // recalcula el checkout server-side). transfer/sublimacion/doming/vinilo
  // faltaban y cotizaban el marcaje a 0 € (auditoría 2026-07-09, A14).
  const TECHNIQUE_PER_UNIT_CENTS: Record<string, number> = {
    serigrafia: 60,
    bordado: 140,
    laser: 95,
    dtf: 110,
    tampografia: 50,
    transfer: 90,
    sublimacion: 85,
    doming: 120,
    vinilo: 80,
  };
  const TECHNIQUE_SETUP_CENTS: Record<string, number> = {
    serigrafia: 4000,
    bordado: 5500,
    laser: 3500,
    dtf: 3000,
    tampografia: 3500,
    transfer: 3500,
    sublimacion: 3000,
    doming: 4000,
    vinilo: 3000,
  };
  const activePromos = await loadActivePromotions();
  type QuoteItemEnriched = {
    description: string;
    notFound: boolean;
    searchedAs?: string;
    quantity: number;
    sizes?: Record<string, number> | null;
    technique: string | null;
    colorRequested: string | null;
    rationale: string;
    product: {
      slug: string;
      name: string;
      ref: string;
      url: string;
      primaryImageUrl: string | null;
    } | null;
    unitPriceCents: number | null;
    markingPerUnitCents: number;
    markingSetupCents: number;
    totalCents: number | null;
    priceSource: "tier" | "estimate" | null;
  };

  const enrichedQuoteItems: QuoteItemEnriched[] = await Promise.all(
    (parsedRec.quoteItems || []).map(async (it): Promise<QuoteItemEnriched> => {
      const base: QuoteItemEnriched = {
        description: it.description || "",
        notFound: !!it.notFound,
        searchedAs: it.searchedAs,
        quantity: Number(it.quantity) || 0,
        sizes: it.sizes || null,
        technique: it.technique || null,
        colorRequested: it.colorRequested || null,
        rationale: it.rationale || "",
        product: null,
        unitPriceCents: null,
        markingPerUnitCents: 0,
        markingSetupCents: 0,
        totalCents: null,
        priceSource: null,
      };
      if (!it.slug || base.quantity <= 0) return base;

      const p = await prisma.product.findUnique({
        where: { slug: it.slug },
        select: {
          slug: true,
          name: true,
          id: true, internalRef: true,
          brand: true,
          categoryId: true,
          primaryImageUrl: true,
          fromPriceCents: true,
          category: { select: { name: true } },
          override: {
            select: {
              customName: true,
              customFromPriceCents: true,
              marginPct: true,
              marketingTags: true,
            },
          },
          variants: {
            select: {
              priceTiers: {
                select: { minQty: true, unitPriceCents: true },
              },
            },
          },
        },
      });
      if (!p) return base;

      base.product = {
        slug: p.slug,
        name: publicProductName(p.name, p.override?.customName),
        ref: publicRef(p), // NUNCA supplierRef en endpoint público
        url: `/catalogo/${p.slug}`,
        primaryImageUrl: proxyImageUrl(p.primaryImageUrl), // ver nota arriba
      };

      // Precio cliente por el pipeline CANÓNICO (override + promos), el mismo
      // que la ficha. Antes: applyMargin(fromPriceCents) sin override → los 59
      // Adivin salían +60% y el resto ignoraba promociones (auditoría A14).
      const variantWithTiers = p.variants.find((v) => v.priceTiers.length > 0);
      const cp = computeClientPricing({
        product: {
          id: p.id,
          name: p.name,
          brand: p.brand,
          categoryId: p.categoryId,
          fromPriceCents: p.fromPriceCents,
          category: p.category ? { name: p.category.name } : null,
        },
        override: p.override
          ? {
              customFromPriceCents: p.override.customFromPriceCents,
              marginPct: p.override.marginPct,
              marketingTags: p.override.marketingTags,
            }
          : null,
        providerNetTiers: variantWithTiers?.priceTiers.map((pt) => ({
          minQty: pt.minQty,
          unitPriceCents: pt.unitPriceCents,
        })),
        activePromos,
      });
      const clientTiers =
        cp.clientTiers ??
        (cp.baseCentsForEstimate ? defaultTiersFromBase(cp.baseCentsForEstimate) : []);
      const unitClientCents =
        pickTier(clientTiers, base.quantity)?.unitPriceCents ??
        cp.baseCentsForEstimate ??
        null;
      base.priceSource = cp.clientTiers ? "tier" : "estimate";
      base.unitPriceCents = unitClientCents;

      // 3) Coste marcaje si LLM detectó técnica
      if (it.technique && unitClientCents !== null) {
        const k = it.technique.toLowerCase();
        base.markingPerUnitCents = TECHNIQUE_PER_UNIT_CENTS[k] ?? 0;
        base.markingSetupCents = TECHNIQUE_SETUP_CENTS[k] ?? 0;
      }

      // 4) Total
      if (unitClientCents !== null) {
        base.totalCents =
          unitClientCents * base.quantity +
          base.markingPerUnitCents * base.quantity +
          base.markingSetupCents;
      }

      return base;
    }),
  );

  const quoteTotalCents = enrichedQuoteItems.reduce(
    (sum, it) => sum + (it.totalCents || 0),
    0,
  );
  const quoteItemsCount = enrichedQuoteItems.length;

  // Logging: guardar la consulta para análisis admin (incluye quoteItems
  // si fue modo cotización). Usamos await: el insert es rápido (<50ms),
  // sin él el fire-and-forget no completaba antes de que Next terminara
  // el handler en runtime nodejs containerizado.
  const resolvedMode = parsedRec.mode || (quoteItemsCount > 0 ? "quote" : "recommend");
  let queryId: string | null = null;
  try {
    const created = await prisma.recommenderQuery.create({
      data: {
        brief,
        budget: budget ?? null,
        quantity: quantity ?? null,
        ecoOnly: !!ecoOnly,
        needsClarification: !!parsedRec.needsClarification,
        fallback: false,
        recommendedSlugs: enriched.filter(Boolean).map((r) => r!.slug),
        summary: parsedRec.summary || null,
        modelUsed: json.model || MODEL,
        promptTokens: json.usage?.prompt_tokens ?? null,
        completionTokens: json.usage?.completion_tokens ?? null,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        ua: req.headers.get("user-agent")?.slice(0, 500) || null,
        mode: resolvedMode,
        // Solo añadimos quoteItems si hay items; si no, undefined deja el campo null.
        ...(quoteItemsCount > 0
          ? {
              quoteItems: enrichedQuoteItems as unknown as Prisma.InputJsonValue,
              quoteTotalCents,
            }
          : {}),
      },
      select: { id: true },
    });
    queryId = created.id;
  } catch (e) {
    console.error("[recommend] failed to persist RecommenderQuery:", e);
    // También en /admin/insights/errors para que se vea en el panel.
    // captureError es síncrono y fire-and-forget; tiene cooldown propio.
    captureError(e, {
      context: "api/recommend/persist",
      severity: "error",
      notifyAdmin: true,
    });
  }

  // Bump recommenderCount + view30d para productos recomendados/cotizados
  void (async () => {
    try {
      const slugs = new Set<string>();
      enriched.forEach((r) => { if (r) slugs.add(r.slug); });
      enrichedQuoteItems.forEach((it) => {
        if (!it.notFound && it.product?.slug) slugs.add(it.product.slug);
      });
      if (slugs.size === 0) return;
      const prods = await prisma.product.findMany({
        where: { slug: { in: Array.from(slugs) } },
        select: { id: true },
      });
      await Promise.all(
        prods.map((p) =>
          prisma.productView.upsert({
            where: { productId: p.id },
            update: {
              recommenderCount: { increment: 1 },
              view30d: { increment: 1 },
            },
            create: {
              productId: p.id,
              recommenderCount: 1,
              view30d: 1,
            },
          }),
        ),
      );
    } catch (e) {
      console.error("[recommend] track productView failed:", e);
      captureError(e, {
        context: "api/recommend/track-views",
        severity: "warning",
        notifyAdmin: false, // baja prioridad: no rompe la UX
      });
    }
  })();

  return NextResponse.json({
    ok: true,
    mode: parsedRec.mode || (quoteItemsCount > 0 ? "quote" : "recommend"),
    needsClarification: !!parsedRec.needsClarification,
    clarificationQuestion: parsedRec.clarificationQuestion || null,
    recommendations: enriched.filter(Boolean),
    quoteItems: enrichedQuoteItems,
    quoteTotalCents: quoteItemsCount > 0 ? quoteTotalCents : null,
    summary: parsedRec.summary || "",
    model: json.model || MODEL,
    usage: json.usage,
    // ID de la query persistida — usado por el componente para vincular
    // la Proposal generada al hacer "enviar por email".
    queryId,
  });
}

/**
 * Intenta parsear un string como JSON con tolerancia. Maneja:
 *  - Bloques ```json ... ``` o ``` ... ```
 *  - Texto antes/después del JSON (busca primer { o [ y último } o ])
 *  - Caracteres de control y BOM
 * Devuelve null si no consigue parsear.
 */
function tryParseJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // Quitar BOM y normalizar
  let s = raw.replace(/^﻿/, "").trim();
  // Quitar fences markdown
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  // Intentar parse directo
  try {
    return JSON.parse(s) as T;
  } catch {}
  // Buscar el primer { o [ y el último } o ]
  const first = Math.min(
    ...["{", "["].map((c) => {
      const i = s.indexOf(c);
      return i === -1 ? Infinity : i;
    }),
  );
  const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (first === Infinity || last === -1 || last <= first) return null;
  try {
    return JSON.parse(s.slice(first, last + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Extrae palabras clave del brief del usuario para usar como query del
 * catálogo cuando la IA falla. Quita stopwords y conecta lo relevante.
 */
function extractKeywords(brief: string): string {
  const stop = new Set([
    "el","la","los","las","un","una","unos","unas","de","del","para","por","con","en","y","o","u","mi","tu","su","es","son","sea","ser","que","como","cómo","necesito","quiero","busco","tenemos","tenéis","muchas","unos","poco","poca","más","mas","menos","muy","todo","toda","algo","alguna","algún","cualquier","posible","tipo","modelo","marca","producto","productos","empresa","evento","tener","hacer","¿","?","¡","!",",",".",";",":"
  ]);
  return brief
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, 5)
    .join(" ");
}
