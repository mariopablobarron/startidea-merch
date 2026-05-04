import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Recomendador IA — recibe brief libre + filtros opcionales y devuelve
 * 3-5 productos del catálogo con justificación.
 *
 * Uso de Anthropic Claude Sonnet 4.6 con prompt caching del catálogo
 * (90% descuento al repetir la misma "bola" de productos en múltiples
 * queries dentro de la ventana TTL de 5 min). Si no hay ANTHROPIC_API_KEY,
 * devuelve 503 con mensaje claro — no rompe la app.
 */

const Schema = z.object({
  brief: z.string().min(20).max(2000),
  budget: z.number().int().positive().max(1_000_000).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  preferredCategories: z.array(z.string()).max(8).optional(),
  ecoOnly: z.boolean().optional(),
});

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

export async function POST(req: Request) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json(
      {
        error: "Recomendador IA no configurado",
        hint: "Falta ANTHROPIC_API_KEY en envs de la app.",
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
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { brief, budget, quantity, preferredCategories, ecoOnly } = parsed.data;

  // 1) Snapshot ligero del catálogo. Cabe en contexto: top 250 productos
  // con stock real, descripción corta y categoría. Suficiente para
  // recomendar bien y no satura tokens.
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(ecoOnly ? { OR: [
        { material: { contains: "bambú", mode: "insensitive" } },
        { material: { contains: "rpet", mode: "insensitive" } },
        { material: { contains: "orgán", mode: "insensitive" } },
        { material: { contains: "recic", mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: [{ syncedAt: "desc" }],
    take: 250,
    select: {
      slug: true,
      supplierRef: true,
      name: true,
      brand: true,
      shortDescription: true,
      material: true,
      category: { select: { name: true } },
      variants: {
        take: 1,
        select: { stockQty: true },
      },
    },
  });

  // 2) Block "documents" cacheable. Cualquier brief que entre dentro de la
  // ventana TTL (5 min) reusa este bloque sin pagar tokens de input.
  const catalogBlock = products
    .map(
      (p, i) =>
        `[${i + 1}] ${p.name} · ref ${p.supplierRef} · ${p.category?.name || "—"} · ${p.material || "—"} · stock ${p.variants[0]?.stockQty ?? 0} · slug=${p.slug}\n   ${p.shortDescription || ""}`,
    )
    .join("\n");

  const systemPrompt = `Eres un consultor B2B de merchandising corporativo en español. Tu trabajo es leer un brief de cliente y recomendar 3 a 5 productos del catálogo de TodoMerchandising (Startidea Málaga SL) que mejor encajen.

Reglas estrictas:
1. SOLO recomiendas productos que aparecen en el catálogo proporcionado. No inventas referencias.
2. Cada recomendación incluye: slug del producto, justificación corta (1-2 frases) y por qué encaja con el brief.
3. Tono cercano, directo, español de España. Tuteo. Sin tecnicismos vacíos.
4. Si el brief es ambiguo, pide aclaración en lugar de adivinar.
5. Responde SOLO con JSON válido. No envuelvas en markdown, no añadas comentarios.

Formato de respuesta JSON:
{
  "needsClarification": false,
  "clarificationQuestion": null,
  "recommendations": [
    { "slug": "<slug>", "ref": "<ref>", "name": "<name>", "rationale": "<2 frases>" }
  ],
  "summary": "<frase de cierre comercial, 1 línea>"
}

Si needsClarification=true, recommendations es []  y clarificationQuestion contiene la pregunta única que necesitas responder.`;

  const userPrompt = `Brief del cliente:
"""
${brief}
"""${budget ? `\n\nPresupuesto orientativo: ${budget} €` : ""}${quantity ? `\n\nCantidad estimada: ${quantity} unidades` : ""}${preferredCategories?.length ? `\n\nCategorías preferidas: ${preferredCategories.join(", ")}` : ""}${ecoOnly ? "\n\nFiltro: SOLO productos eco/sostenibles." : ""}

Recomienda los 3-5 productos del catálogo que mejor resuelven este brief. Devuelve SOLO el JSON descrito.`;

  // 3) Llamada a Anthropic con prompt caching del catálogo
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: [
          { type: "text", text: systemPrompt },
          {
            type: "text",
            text: `CATÁLOGO DISPONIBLE (${products.length} productos):\n\n${catalogBlock}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Fallo al llamar a Anthropic", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "Anthropic respondió con error", status: response.status, detail: detail.slice(0, 400) },
      { status: 502 },
    );
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: Record<string, number>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text || "";

  let parsedRec: {
    needsClarification?: boolean;
    clarificationQuestion?: string | null;
    recommendations?: Array<{ slug: string; ref?: string; name?: string; rationale?: string }>;
    summary?: string;
  };
  try {
    parsedRec = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Respuesta del modelo no es JSON válido", raw: text.slice(0, 500) },
      { status: 502 },
    );
  }

  // 4) Enriquecer con datos reales del producto desde DB (slug → URL ficha)
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

  return NextResponse.json({
    ok: true,
    needsClarification: !!parsedRec.needsClarification,
    clarificationQuestion: parsedRec.clarificationQuestion || null,
    recommendations: enriched.filter(Boolean),
    summary: parsedRec.summary || "",
    usage: json.usage,
  });
}
