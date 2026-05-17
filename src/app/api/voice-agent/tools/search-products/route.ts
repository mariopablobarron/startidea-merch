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

  // Búsqueda básica: name OR shortDescription OR category.name CONTAINS query (insensitive)
  const q = query.trim();
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { shortDescription: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } },
      ],
      ...(category
        ? { category: { name: { contains: category, mode: "insensitive" } } }
        : {}),
      override: { is: { hidden: false } },
    },
    take: max_results,
    select: {
      id: true,
      slug: true,
      internalRef: true,
      name: true,
      brand: true,
      shortDescription: true,
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
      short_description: p.shortDescription?.slice(0, 200) || null,
      category: p.category?.name || null,
      from_price_eur: p.fromPriceCents ? p.fromPriceCents / 100 : null,
      product_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es"}/catalogo/${p.slug}`,
    })),
  });
}
