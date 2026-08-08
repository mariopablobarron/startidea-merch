import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { publicRef } from "@/lib/internal-ref";
import { publicBrand } from "@/lib/brand-filter";
import { positionOptionLabel } from "@/lib/marking-position-label";
import { legacyHtmlToText, publicProductName } from "@/lib/product-name";
import { displayFromPrice } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ slug: z.string().min(1).max(160) });

/**
 * Tool: get_product_details
 * El agente la usa cuando el usuario muestra interés en un producto concreto.
 * Devuelve datos optimizados para voz: dimensiones, material, zonas de
 * marcaje disponibles, técnicas, stock disponible (sí/no).
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "slug requerido" }, { status: 400 });

  const p = await prisma.product.findUnique({
    where: { slug: parsed.data.slug },
    include: {
      variants: { select: { stockQty: true } },
      positions: {
        select: {
          positionId: true,
          maxWidthMm: true,
          maxHeightMm: true,
          techniques: { include: { technique: true } },
        },
      },
      override: {
        select: {
          hidden: true,
          customName: true,
          customFromPriceCents: true,
          marginPct: true,
          marketingTags: true,
        },
      },
    },
  });

  if (!p) return NextResponse.json({ error: "Producto no encontrado", slug: parsed.data.slug }, { status: 404 });
  if (p.override?.hidden) return NextResponse.json({ error: "Producto no disponible" }, { status: 404 });

  const totalStock = p.variants.reduce((s, v) => s + (v.stockQty || 0), 0);
  // Precio CLIENTE (override > promo > margen) — nunca el neto de proveedor.
  const price = displayFromPrice(
    { id: p.id, name: p.name, brand: p.brand, categoryId: p.categoryId, fromPriceCents: p.fromPriceCents },
    p.override,
    await loadActivePromotions(),
  );

  return NextResponse.json({
    ref: publicRef(p),
    slug: p.slug,
    name: publicProductName(p.name, p.override?.customName),
    brand: publicBrand(p.brand),
    short_description: legacyHtmlToText(p.shortDescription).slice(0, 300) || null,
    long_description: legacyHtmlToText(p.longDescription).slice(0, 800) || null,
    material: legacyHtmlToText(p.material) || null,
    dimensions_mm: {
      length: p.lengthMm,
      width: p.widthMm,
      height: p.heightMm,
      weight_g: p.weightG,
    },
    from_price_eur: price.finalCents != null ? price.finalCents / 100 : null,
    in_stock: totalStock > 0,
    total_stock: totalStock,
    // `position_label` es lo que el agente le DICE al cliente por teléfono, así que
    // pasa por la misma regla que la ficha: nunca «Default». Aquí sí hay lista, con
    // lo que la zona sin nombre puede numerarse por orden y seguir siendo elegible.
    // `position_id` sigue siendo el código crudo: es el que viaja a submit-quote.
    marking_positions: p.positions.map((pos, posIdx) => ({
      position_id: pos.positionId,
      position_label: positionOptionLabel(pos, posIdx),
      max_width_mm: pos.maxWidthMm,
      max_height_mm: pos.maxHeightMm,
      techniques: pos.techniques.map((t) => ({
        name: t.technique.name,
        max_colors: t.maxColors,
        is_default: t.isDefault,
      })),
    })),
    product_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es"}/catalogo/${p.slug}`,
  });
}
