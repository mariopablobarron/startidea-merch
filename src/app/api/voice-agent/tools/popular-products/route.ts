/**
 * Tool Carmen: popular_products
 *
 * Cuando el cliente pregunta cosas como:
 *   - "¿qué se vende más?"
 *   - "¿qué es lo más popular?"
 *   - "recomiéndame algo top"
 *
 * Devuelve los 5 productos más visualizados últimos 30 días con
 * formato optimizado para lectura por voz (ref interna sin codes
 * técnicos, precio en euros, frase summary lista).
 */
import { NextResponse } from "next/server";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { getTopViewedProducts } from "@/lib/insights";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const top = await getTopViewedProducts(5, "30d");
  if (top.length === 0) {
    return NextResponse.json({
      ok: true,
      products: [],
      summary: null,
      tts_hint:
        "Por ahora todavía no tenemos un ranking claro. Si me dices qué buscas, te recomiendo según producto, cantidad y presupuesto.",
    });
  }

  // Enrich con precio desde el primer tier
  const slugs = top.map((p) => p.slug);
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      name: true,
      variants: {
        select: {
          priceTiers: {
            orderBy: { minQty: "asc" },
            take: 1,
            select: { unitPriceCents: true, minQty: true },
          },
        },
        take: 1,
      },
    },
  });

  const productList = top.map((p) => {
    const found = products.find((x) => x.slug === p.slug);
    const tier = found?.variants[0]?.priceTiers[0];
    return {
      name: p.name,
      slug: p.slug,
      views_30d: p.view30d,
      from_price_eur: tier ? Math.round(tier.unitPriceCents / 100) : null,
      from_qty: tier?.minQty ?? null,
    };
  });

  const summary = `Los 5 productos más populares este mes son: ${productList
    .slice(0, 5)
    .map((p, i) => `${i + 1}. ${p.name}`)
    .join("; ")}.`;

  return NextResponse.json({
    ok: true,
    products: productList,
    summary,
    tts_hint:
      "Lee la lista despacio, nombrando 2-3 productos. Si el cliente quiere detalles de uno concreto, llama a product_details.",
  });
}
