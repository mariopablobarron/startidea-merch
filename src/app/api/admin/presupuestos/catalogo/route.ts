import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicProductName } from "@/lib/product-name";
import { publicRef } from "@/lib/internal-ref";
import {
  costeAlTramo,
  formatearArea,
  formatearMedidas,
  type ProductoParaLinea,
} from "@/lib/presupuesto-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca productos del catálogo para rellenar una línea del presupuesto.
 *
 * Devuelve identidad (nombre, referencia STM, foto), medidas, el área y la
 * técnica de marcaje, y el coste NETO del tramo que aplica a la cantidad pedida
 * — este último como sugerencia por confirmar en el portal, no como precio.
 *
 * Nunca sale la referencia del proveedor ni su nombre: solo `internalRef`.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const cantidad = Math.max(1, Number(url.searchParams.get("cantidad")) || 1);
  if (q.length < 2) return NextResponse.json({ items: [] });

  const productos = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { internalRef: { contains: q, mode: "insensitive" } },
        { slug: { contains: q.toLowerCase().replace(/\s+/g, "-") } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      internalRef: true,
      material: true,
      lengthMm: true,
      widthMm: true,
      heightMm: true,
      primaryImageUrl: true,
      override: { select: { customName: true } },
      variants: {
        where: { priceTiers: { some: {} } },
        take: 1,
        orderBy: { sku: "asc" },
        select: { priceTiers: { select: { minQty: true, unitPriceCents: true } } },
      },
      positions: {
        take: 1,
        orderBy: { positionId: "asc" },
        select: {
          positionId: true,
          maxWidthMm: true,
          maxHeightMm: true,
          techniques: { take: 1, select: { technique: { select: { name: true } } } },
        },
      },
    },
    take: 12,
    orderBy: { name: "asc" },
  });

  const items: ProductoParaLinea[] = productos.map((p) => {
    const tiers = p.variants[0]?.priceTiers ?? [];
    const coste = costeAlTramo(tiers, cantidad);
    const pos = p.positions[0];
    return {
      slug: p.slug,
      // `publicRef` deriva una STM- determinista si la fila aún no la tiene:
      // el documento nunca enseña la referencia del proveedor.
      referencia: publicRef(p),
      nombre: publicProductName(p.name, p.override?.customName),
      imagenUrl: proxyImageUrl(p.primaryImageUrl),
      material: p.material,
      medidas: formatearMedidas(p),
      costeUnitCents: coste?.costeUnitCents ?? null,
      tramoMinQty: coste?.tramoMinQty ?? null,
      marcaje: pos
        ? {
            posicion: pos.positionId,
            areaMaxima: formatearArea(pos.maxWidthMm, pos.maxHeightMm),
            tecnica: pos.techniques[0]?.technique.name ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ items });
}
