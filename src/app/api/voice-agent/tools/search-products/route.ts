import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { publicRef } from "@/lib/internal-ref";
import { publicBrand } from "@/lib/brand-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  query: z.string().min(2).max(120),
  category: z.string().max(80).optional().nullable(),
  max_results: z.number().int().min(1).max(10).optional().default(5),
});

/**
 * Tool: search_products
 * El agente Alma la usa cuando el usuario pregunta "¿tenéis bolígrafos?".
 * Devuelve lista corta optimizada para que Alma la lea al usuario por voz.
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const { query, category, max_results } = parsed.data;

  // Tokenizamos: cada token genera condiciones OR a través de 5 campos.
  // El agente envía a menudo conceptos genéricos ("botella", "tote bag",
  // "regalo navidad"); los nombres comerciales del catálogo no los
  // contienen literal — necesitamos buscar también en descripciones largas
  // y en el path de categoría.
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  const tokenConditions = tokens.length > 0 ? tokens : [query.trim()];

  const products = await prisma.product.findMany({
    where: {
      active: true,
      AND: tokenConditions.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" as const } },
          { shortDescription: { contains: t, mode: "insensitive" as const } },
          { longDescription: { contains: t, mode: "insensitive" as const } },
          { enhancedShortDescription: { contains: t, mode: "insensitive" as const } },
          { category: { name: { contains: t, mode: "insensitive" as const } } },
          { tags: { has: t } },
        ],
      })),
      ...(category
        ? { category: { name: { contains: category, mode: "insensitive" as const } } }
        : {}),
      override: { is: { hidden: false } },
    },
    take: max_results,
    orderBy: [{ fromPriceCents: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      internalRef: true,
      name: true,
      brand: true,
      shortDescription: true,
      enhancedShortDescription: true,
      fromPriceCents: true,
      category: { select: { name: true } },
    },
  });

  return NextResponse.json({
    count: products.length,
    products: products.map((p) => ({
      ref: publicRef(p),
      slug: p.slug,
      name: p.name,
      brand: publicBrand(p.brand),
      short_description: p.enhancedShortDescription?.slice(0, 200) || p.shortDescription?.slice(0, 200) || null,
      category: p.category?.name || null,
      from_price_eur: p.fromPriceCents ? p.fromPriceCents / 100 : null,
      product_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es"}/catalogo/${p.slug}`,
    })),
    note:
      products.length === 0
        ? `No encontré productos para "${query}". Pide al usuario que reformule (ej: 'termos', 'tote bag', 'libreta')`
        : null,
  });
}
