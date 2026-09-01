import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { pickTier } from "@/lib/pricing";
import { desglosarMarcaje, type MarcajeParaLinea } from "@/lib/presupuesto-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Técnicas de marcaje de un producto, tarificadas a la cantidad pedida.
 *
 * No se inventa nada aquí: la cotización la hace `quoteMarkingNet`, la misma
 * cascada que usan la ficha pública y el checkout (escalas reales → tarifa por
 * producto → regla de markup), que devuelve `ok:false` cuando no hay tarifa
 * fiable en vez de cotizar a cero. Cuando dice que no, aquí sale sin coste y
 * con el motivo, para teclearlo a mano.
 *
 * Como con el producto, el coste llega SIN CONFIRMAR: el catálogo ahorra
 * teclear, y el precio se mira en el portal del proveedor.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  const cantidad = Math.max(1, Number(url.searchParams.get("cantidad")) || 1);
  const tintas = Math.max(1, Number(url.searchParams.get("tintas")) || 1);
  if (!slug) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  const producto = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      supplier: true,
      variants: {
        where: { priceTiers: { some: {} } },
        take: 1,
        orderBy: { sku: "asc" },
        select: { priceTiers: { select: { minQty: true, unitPriceCents: true } } },
      },
      positions: {
        select: {
          maxWidthMm: true,
          maxHeightMm: true,
          techniques: { select: { technique: { select: { code: true, name: true } } } },
        },
      },
    },
  });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const tiers = producto.variants[0]?.priceTiers ?? [];
  const costeProducto =
    pickTier(
      tiers.map((t) => ({ ...t, source: "PROVIDER" as const })),
      cantidad,
    )?.unitPriceCents ?? 0;

  // Una técnica puede estar en varias posiciones con áreas distintas. Se
  // tarifica con la MAYOR de ellas: las tarifas por cm² suben con el área, y
  // cotizar por la pequeña dejaría corto el presupuesto si el arte va en la
  // grande, que es justo el caso que el cliente pide.
  const porTecnica = new Map<string, { nombre: string; areaCm2: number | null }>();
  for (const pos of producto.positions) {
    const areaCm2 =
      pos.maxWidthMm && pos.maxHeightMm ? (pos.maxWidthMm * pos.maxHeightMm) / 100 : null;
    for (const { technique } of pos.techniques) {
      const previa = porTecnica.get(technique.code);
      if (!previa) {
        porTecnica.set(technique.code, { nombre: technique.name, areaCm2 });
      } else if (areaCm2 !== null && (previa.areaCm2 === null || areaCm2 > previa.areaCm2)) {
        previa.areaCm2 = areaCm2;
      }
    }
  }

  const tecnicas: MarcajeParaLinea[] = [];
  for (const [codigo, { nombre, areaCm2 }] of porTecnica) {
    let cotizacion;
    try {
      cotizacion = await quoteMarkingNet({
        productId: producto.id,
        supplier: producto.supplier,
        techniqueCode: codigo.toUpperCase(),
        quantity: cantidad,
        productNetUnitCents: costeProducto,
        printAreaCm2: areaCm2,
        numberOfColours: tintas,
      });
    } catch {
      tecnicas.push({
        codigo,
        nombre,
        costeUnitCents: null,
        clicheCents: 0,
        areaCm2,
        aviso: "La técnica no se pudo tarificar: pide el coste al proveedor.",
      });
      continue;
    }
    if (!cotizacion.ok) {
      tecnicas.push({
        codigo,
        nombre,
        costeUnitCents: null,
        clicheCents: 0,
        areaCm2,
        aviso: cotizacion.warning ?? "Sin tarifa fiable: pide el coste al proveedor.",
      });
      continue;
    }
    const { costeUnitCents, clicheCents } = desglosarMarcaje(cotizacion, cantidad);
    tecnicas.push({ codigo, nombre, costeUnitCents, clicheCents, areaCm2, aviso: null });
  }

  tecnicas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return NextResponse.json({ tecnicas });
}
