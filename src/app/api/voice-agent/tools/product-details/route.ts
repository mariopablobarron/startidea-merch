import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { publicRef } from "@/lib/internal-ref";
import { publicBrand } from "@/lib/brand-filter";
import { displayPositionId } from "@/lib/marking-position-display";

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
      override: { select: { hidden: true, customName: true } },
    },
  });

  if (!p) return NextResponse.json({ error: "Producto no encontrado", slug: parsed.data.slug }, { status: 404 });
  if (p.override?.hidden) return NextResponse.json({ error: "Producto no disponible" }, { status: 404 });

  const totalStock = p.variants.reduce((s, v) => s + (v.stockQty || 0), 0);

  return NextResponse.json({
    ref: publicRef(p),
    slug: p.slug,
    name: p.override?.customName || p.name,
    brand: publicBrand(p.brand),
    short_description: p.shortDescription?.slice(0, 300) || null,
    long_description: p.longDescription?.slice(0, 800) || null,
    material: p.material || null,
    dimensions_mm: {
      length: p.lengthMm,
      width: p.widthMm,
      height: p.heightMm,
      weight_g: p.weightG,
    },
    from_price_eur: p.fromPriceCents ? p.fromPriceCents / 100 : null,
    in_stock: totalStock > 0,
    total_stock: totalStock,
    marking_positions: p.positions.map((pos) => ({
      position_id: pos.positionId,
      position_label: displayPositionId(pos.positionId),
      max_width_mm: pos.maxWidthMm,
      max_height_mm: pos.maxHeightMm,
      techniques: pos.techniques.map((t) => ({
        name: t.technique.name,
        max_colors: t.maxColors,
        is_default: t.isDefault,
      })),
    })),
    product_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es"}/catalogo/${p.slug}`,
  });
}
