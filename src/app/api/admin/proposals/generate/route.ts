import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { extractJsonFromAIResponse } from "@/lib/json-extract";
import { generateEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { defaultTiersFromBase, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { publicProductName } from "@/lib/product-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
// Default proposal generator = Opus 4.7 (junio 2026, mejor reasoning
// Anthropic actual). Más caro pero queremos máxima calidad para B2B.
// Override con OPENROUTER_MODEL_PROPOSAL en el .env del VPS si quieres
// bajar a sonnet. NO usamos OPENROUTER_MODEL aquí porque eso afectaría
// también al recomendador público (/api/recommend).
const MODEL =
  process.env.OPENROUTER_MODEL_PROPOSAL ||
  process.env.OPENROUTER_MODEL ||
  "anthropic/claude-opus-4.7";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const Schema = z.object({
  contact: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    company: z.string().max(160).optional(),
    phone: z.string().max(40).optional(),
  }),
  brief: z.string().min(20).max(4000),
  budget: z.number().int().positive().max(1_000_000).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  ecoOnly: z.boolean().optional(),
  internalNotes: z.string().max(2000).optional(),
});

/**
 * POST /api/admin/proposals/generate
 *
 * Convierte brief libre + contacto en un CartQuote completo:
 *   1. Pasa el brief al modelo IA (mismo que /api/recommend) para elegir 3-5
 *      productos del catálogo.
 *   2. Para cada producto elegido, calcula precio cliente con margen
 *      (basado en estimateBaseCentsFromName + applyMargin).
 *   3. Crea CartQuote con CartQuoteItems poblados, status NEW, source
 *      "admin-ai-generator", e internalNotes con la justificación del
 *      modelo + brief original.
 *
 * Devuelve el id del CartQuote creado para que el admin abra la ficha y
 * pueda revisar/editar antes de enviar PDF al cliente.
 */
export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!OPENROUTER_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY no configurada" },
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
  const { contact, brief, budget, quantity, ecoOnly, internalNotes } = parsed.data;

  // 1. Catálogo relevante: búsqueda semántica del brief con embeddings.
  // Resuelve casos como "toalla microfibra" cuando en BD está como
  // "toalla deportiva" o "secado rápido" (mismo material, otro nombre).
  // Fallback: si no hay embeddings calculados, usa los últimos 250 por sync.
  const ecoWhere: Prisma.ProductWhereInput | undefined = ecoOnly
    ? {
        OR: [
          { material: { contains: "bambú", mode: "insensitive" } },
          { material: { contains: "rpet", mode: "insensitive" } },
          { material: { contains: "orgán", mode: "insensitive" } },
          { material: { contains: "recic", mode: "insensitive" } },
        ],
      }
    : undefined;

  const productSelect = {
    slug: true,
    supplierRef: true,
    name: true,
    brand: true,
    shortDescription: true,
    enhancedShortDescription: true,
    material: true,
    primaryImageUrl: true,
    category: { select: { name: true } },
    variants: { take: 1, select: { stockQty: true } },
  } satisfies Prisma.ProductSelect;

  type ProductCard = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

  let products: ProductCard[] = [];
  let catalogSource: "semantic" | "recent" = "recent";

  try {
    const briefVector = await generateEmbedding(`${brief}\n${internalNotes ?? ""}`);
    if (briefVector) {
      const allEmbeddings = await prisma.productEmbedding.findMany({
        select: {
          vector: true,
          product: {
            select: { id: true, slug: true, active: true, material: true },
          },
        },
      });
      const ranked = allEmbeddings
        .filter((row) => row.product?.active)
        .filter((row) => {
          if (!ecoOnly) return true;
          const m = (row.product?.material || "").toLowerCase();
          return /bamb[uú]|rpet|org[áa]n|recic/.test(m);
        })
        .map((row) => ({
          slug: row.product!.slug,
          score: cosineSimilarity(briefVector, row.vector),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 80);
      if (ranked.length > 0) {
        const topSlugs = ranked.map((r) => r.slug);
        const fetched = await prisma.product.findMany({
          where: { slug: { in: topSlugs }, active: true },
          select: productSelect,
        });
        // Reordenar para mantener el ranking por score
        const bySlug = new Map(fetched.map((p) => [p.slug, p]));
        products = ranked
          .map((r) => bySlug.get(r.slug))
          .filter((p): p is ProductCard => !!p);
        catalogSource = "semantic";
      }
    }
  } catch (e) {
    console.error("[proposals/generate] semantic search failed, fallback:", e);
  }

  // Fallback: últimos 250 por syncedAt
  if (products.length === 0) {
    products = await prisma.product.findMany({
      where: { active: true, ...(ecoWhere ?? {}) },
      orderBy: [{ syncedAt: "desc" }],
      take: 250,
      select: productSelect,
    });
  }

  // Catálogo en prompt: descripciones truncadas a 120 chars para mantener
  // el prompt pequeño y rápido. El modelo decide por nombre + categoría +
  // material; la descripción solo da contexto adicional. Antes íbamos sin
  // límite y un brief con 250 productos × descs largas hinchaba el prompt
  // a 100-200K chars → request lento o time-out.
  function truncate(s: string | null | undefined, max: number): string {
    if (!s) return "";
    return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
  }
  const catalogBlock = products
    .map((p, i) => {
      const desc = truncate(
        p.enhancedShortDescription || p.shortDescription,
        120,
      );
      return `[${i + 1}] ${p.name} · ref ${p.supplierRef} · ${p.category?.name || "—"} · ${p.material || "—"} · stock ${p.variants[0]?.stockQty ?? 0} · slug=${p.slug}\n   ${desc}`;
    })
    .join("\n");

  const systemPrompt = `Eres un consultor B2B de merchandising. Lees un brief y eliges 3-5 productos del catálogo proporcionado para componer una propuesta comercial.

Reglas estrictas:
1. SOLO recomiendas productos del catálogo. No inventas refs.
2. Para cada producto: slug, ref, cantidad sugerida (basada en cantidad total del brief si aplica, repartida entre productos sensatamente), justificación 1-2 frases.
3. Tono español de España, tuteo, profesional pero cercano.
4. Responde SOLO con JSON válido. Sin markdown, sin comentarios extra.

Formato JSON:
{
  "items": [
    { "slug": "<slug>", "ref": "<ref>", "quantity": <int>, "rationale": "<2 frases>" }
  ],
  "summary": "<frase breve cierre comercial>",
  "internalAdvice": "<consejo interno para el admin: posibles pegas, oportunidades de upsell, etc.>"
}`;

  const totalQty = quantity || 100;
  const userPrompt = `Brief del cliente:
"""
${brief}
"""

Cantidad total objetivo: ${totalQty} unidades${budget ? `\nPresupuesto orientativo: ${budget} €` : ""}${ecoOnly ? "\nFiltro: solo productos eco/sostenibles." : ""}

Devuelve la propuesta como JSON descrita arriba.`;

  // Timeout explícito 45s. Si OpenRouter se queda colgado, abortamos
  // antes de que Next.js corte la request entera (maxDuration=60).
  // Loggeamos elapsed para diagnóstico.
  const aiStartedAt = Date.now();
  const aiController = new AbortController();
  const aiTimeout = setTimeout(() => aiController.abort(), 45_000);
  let aiRes: Response;
  try {
    aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "TodoMerchandising · proposal generator",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: `CATÁLOGO (${products.length} productos):\n\n${catalogBlock}` },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: aiController.signal,
    });
  } catch (err) {
    clearTimeout(aiTimeout);
    const elapsedMs = Date.now() - aiStartedAt;
    const isAbort = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? `OpenRouter no respondió en 45s (timeout)`
          : "Fallo al llamar a OpenRouter",
        detail: err instanceof Error ? err.message : String(err),
        elapsedMs,
        hint: isAbort
          ? "Modelo lento o saturado. Reintenta — si vuelve a pasar, " +
            "puede haber un problema en OpenRouter o créditos agotados."
          : undefined,
      },
      { status: 502 },
    );
  }
  clearTimeout(aiTimeout);
  if (!aiRes.ok) {
    const detail = (await aiRes.text().catch(() => "")).slice(0, 500);
    return NextResponse.json({ error: "OpenRouter error", status: aiRes.status, detail }, { status: 502 });
  }
  const aiJson = (await aiRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, number>;
  };
  const text = aiJson.choices?.[0]?.message?.content || "";
  let recs: { items: Array<{ slug: string; ref?: string; quantity: number; rationale: string }>; summary?: string; internalAdvice?: string };
  try {
    recs = JSON.parse(extractJsonFromAIResponse(text));
  } catch {
    return NextResponse.json(
      {
        error: "Respuesta IA no parseable",
        raw: text.slice(0, 800),
        hint:
          "El modelo no devolvió JSON limpio. Suele pasar por: (1) markdown " +
          "wrapper que el extractor no pilla, (2) respuesta truncada por max_tokens, " +
          "(3) modelo distinto al esperado.",
      },
      { status: 502 },
    );
  }
  if (!recs.items?.length) {
    return NextResponse.json(
      {
        error: "IA no devolvió items",
        raw: text.slice(0, 800),
        parsed: recs,
      },
      { status: 502 },
    );
  }

  // 2. Resolver productos en DB
  const slugs = recs.items.map((it) => it.slug).filter(Boolean);
  const dbProducts = await prisma.product.findMany({
    where: { slug: { in: slugs }, active: true },
    select: {
      id: true,
      slug: true,
      internalRef: true,
      name: true,
      brand: true,
      categoryId: true,
      fromPriceCents: true,
      primaryImageUrl: true,
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
        take: 1,
        select: { sku: true, priceTiers: { orderBy: { minQty: "asc" } } },
      },
    },
  });
  const bySlug = new Map(dbProducts.map((p) => [p.slug, p]));

  const activePromos = await loadActivePromotions();
  const validItems = recs.items
    .map((it) => {
      const p = bySlug.get(it.slug);
      if (!p) return null;

      // Precio cliente por el pipeline CANÓNICO (override + promos), el mismo
      // que ficha/cotizador — antes ignoraba override y las propuestas Adivin
      // salían con precio inventado (auditoría 2026-07-09, M26).
      const variant = p.variants[0];
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
        providerNetTiers: variant?.priceTiers?.map((t) => ({
          minQty: t.minQty,
          unitPriceCents: t.unitPriceCents,
        })),
        activePromos,
      });
      const clientTiers =
        cp.clientTiers ??
        (cp.baseCentsForEstimate ? defaultTiersFromBase(cp.baseCentsForEstimate) : []);
      const unitClient =
        pickTier(clientTiers, it.quantity)?.unitPriceCents ?? cp.baseCentsForEstimate ?? 0;
      const totalClient = unitClient * it.quantity;
      if (unitClient <= 0) return null;

      return {
        productSlug: p.slug,
        // NUNCA supplierRef: este productRef se muestra al cliente en
        // /clientes/[token] (línea ~162). Usamos la ref pública (STM-XXX) o el slug.
        productRef: p.internalRef || p.slug,
        productName: publicProductName(p.name, p.override?.customName),
        primaryImageUrl: p.primaryImageUrl,
        quantity: it.quantity,
        variantSku: variant?.sku || null,
        unitPriceClientCents: unitClient,
        totalClientCents: totalClient,
        notes: it.rationale,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (validItems.length === 0) {
    return NextResponse.json({ error: "Ninguna ref de la IA encontró producto activo" }, { status: 502 });
  }

  const total = validItems.reduce((s, it) => s + (it.totalClientCents || 0), 0);

  // 3. Crear CartQuote
  const internalNotesFinal = [
    "Generado por IA (admin proposal generator).",
    `Brief original: ${brief}`,
    recs.summary ? `Resumen IA: ${recs.summary}` : null,
    recs.internalAdvice ? `Consejo interno IA: ${recs.internalAdvice}` : null,
    internalNotes ? `Notas admin: ${internalNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const cart = await prisma.cartQuote.create({
    data: {
      name: contact.name,
      company: contact.company,
      email: contact.email,
      phone: contact.phone,
      message: brief,
      source: "admin-ai-generator",
      status: "IN_PROGRESS",
      internalNotes: internalNotesFinal,
      estimatedTotalCents: total,
      acceptedTotalCents: total,
      depositPercent: 50,
      utm: { aiModel: MODEL } as Prisma.InputJsonValue,
      items: { create: validItems },
    },
    include: { items: true },
  });

  // Tracking de uso IA: misma tabla que /api/recommend para que las stats
  // de /admin/insights cuenten ambas fuentes (recomendador público +
  // generador admin de propuestas). Fire-and-forget, no rompe el response.
  void prisma.recommenderQuery
    .create({
      data: {
        brief,
        budget: budget ?? null,
        quantity: quantity ?? null,
        ecoOnly: !!ecoOnly,
        needsClarification: false,
        fallback: false,
        recommendedSlugs: recs.items.map((i) => i.slug).filter(Boolean),
        summary: recs.summary ?? null,
        modelUsed: MODEL,
        promptTokens: aiJson.usage?.prompt_tokens ?? null,
        completionTokens: aiJson.usage?.completion_tokens ?? null,
        mode: "proposal", // distingue del recomendador público
      },
    })
    .catch((e) => {
      console.error("[proposals/generate] track usage failed:", e);
    });

  return NextResponse.json({
    ok: true,
    cartId: cart.id,
    items: cart.items.length,
    estimatedTotalCents: total,
    summary: recs.summary,
    internalAdvice: recs.internalAdvice,
    model: MODEL,
    catalogSource, // "semantic" si usó embeddings, "recent" si fallback
    catalogSize: products.length,
    usage: aiJson.usage,
  });
}

function pickPriceTier<T extends { minQty: number; unitPriceCents: number }>(
  tiers: T[],
  qty: number,
): T | undefined {
  if (!tiers.length) return undefined;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0];
  for (const t of sorted) if (qty >= t.minQty) chosen = t;
  return chosen;
}
