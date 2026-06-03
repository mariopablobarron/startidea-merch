import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureError } from "@/lib/insights/capture-error";
import {
  estimateBaseCentsFromName,
  defaultTiersFromBase,
  pickTier,
} from "@/lib/pricing";

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
});

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export async function POST(req: Request) {
  if (!OPENROUTER_KEY) {
    return NextResponse.json(
      {
        error: "Recomendador IA no configurado",
        hint: "Falta OPENROUTER_API_KEY en envs de la app.",
      },
      { status: 503 },
    );
  }

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
  const { brief, budget, quantity, preferredCategories, ecoOnly } = parsed.data;

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
      supplierRef: true,
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
        `[${i + 1}] ${p.name} · ref ${p.supplierRef} · ${p.category?.name || "—"} · ${p.material || "—"} · stock ${p.variants[0]?.stockQty ?? 0} · slug=${p.slug}\n   ${p.enhancedShortDescription || p.shortDescription || ""}`,
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

  // 2) Llamada a OpenRouter (formato OpenAI-compatible)
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "TodoMerchandising",
      },
      body: JSON.stringify({
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
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Fallo al llamar a OpenRouter",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "OpenRouter respondió con error", status: response.status, detail: detail.slice(0, 400) },
      { status: 502 },
    );
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
          supplierRef: true,
          primaryImageUrl: true,
          category: { select: { name: true } },
        },
      });
      if (!p) return null;
      return {
        slug: p.slug,
        name: p.name,
        ref: p.supplierRef,
        category: p.category?.name,
        primaryImageUrl: p.primaryImageUrl,
        url: `/catalogo/${p.slug}`,
        rationale: r.rationale || "",
      };
    }),
  );

  // 3b) Enriquecer quoteItems con producto real + cálculo de precio.
  // Para cada item: si tiene slug, busca producto y calcula precio real con
  // PriceTier si existe, o estimación si no. Marcaje añade setup + por ud.
  const TECHNIQUE_PER_UNIT_CENTS: Record<string, number> = {
    serigrafia: 60,
    bordado: 140,
    laser: 95,
    dtf: 110,
    tampografia: 50,
  };
  const TECHNIQUE_SETUP_CENTS: Record<string, number> = {
    serigrafia: 4000,
    bordado: 5500,
    laser: 3500,
    dtf: 3000,
    tampografia: 3500,
  };
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
          supplierRef: true,
          primaryImageUrl: true,
          fromPriceCents: true,
          category: { select: { name: true } },
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
        name: p.name,
        ref: p.supplierRef,
        url: `/catalogo/${p.slug}`,
        primaryImageUrl: p.primaryImageUrl,
      };

      // 1) Intentar usar PriceTier real del variant con tarifa
      let tierCents: number | null = null;
      for (const v of p.variants) {
        if (v.priceTiers.length > 0) {
          const t = pickTier(
            v.priceTiers.map((pt) => ({
              minQty: pt.minQty,
              unitPriceCents: pt.unitPriceCents,
              source: "PROVIDER" as const,
            })),
            base.quantity,
          );
          if (t) {
            tierCents = t.unitPriceCents;
            base.priceSource = "tier";
            break;
          }
        }
      }
      // 2) Fallback: estimación desde el nombre + curva default
      if (tierCents === null) {
        const baseCents =
          p.fromPriceCents && p.fromPriceCents > 0
            ? p.fromPriceCents
            : estimateBaseCentsFromName(p.name, p.category?.name);
        const t = pickTier(defaultTiersFromBase(baseCents), base.quantity);
        if (t) {
          tierCents = t.unitPriceCents;
          base.priceSource = "estimate";
        }
      }
      base.unitPriceCents = tierCents;

      // 3) Coste marcaje si LLM detectó técnica
      if (it.technique && tierCents !== null) {
        const k = it.technique.toLowerCase();
        base.markingPerUnitCents = TECHNIQUE_PER_UNIT_CENTS[k] ?? 0;
        base.markingSetupCents = TECHNIQUE_SETUP_CENTS[k] ?? 0;
      }

      // 4) Total
      if (tierCents !== null) {
        base.totalCents =
          tierCents * base.quantity +
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
