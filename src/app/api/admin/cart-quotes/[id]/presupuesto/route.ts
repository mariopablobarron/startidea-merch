import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
import { requireAdminSecret } from "@/lib/auth";
import { crearPresupuesto } from "@/lib/presupuesto-repo";
import { leerMargenes, margenDeJerarquia } from "@/lib/presupuesto-margenes";
import { redondearPvpLimpio } from "@/lib/presupuesto-calculo";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicProductName } from "@/lib/product-name";
import { publicRef } from "@/lib/internal-ref";
import {
  costeAlTramo,
  desglosarMarcaje,
  formatearArea,
  formatearMedidas,
  type MarcajeParaLinea,
} from "@/lib/presupuesto-catalogo";
import { entradaDesdeCarrito, type ItemResuelto } from "@/lib/presupuesto-desde-carrito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plazos por defecto del encargo, los mismos con los que nace un presupuesto vacío. */
const VALIDEZ_DIAS = 30;
const PLAZO_MIN_DIAS = 8;
const PLAZO_MAX_DIAS = 15;

/**
 * Crea un presupuesto en borrador a partir de un carrito de cotización.
 *
 * Hereda la estructura —cliente, productos, cantidades, marcaje— y vuelve a
 * calcular los costes contra el catálogo, sin heredar el precio que el cliente
 * vio en la web: aquél lleva el margen automático de la tienda y un
 * presupuesto se cotiza al margen del encargo sobre el coste del portal. Todo
 * entra marcado como no verificado.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const carrito = await prisma.cartQuote.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      vatNumber: true,
      internalNotes: true,
      shippingAddress: true,
      shippingPostalCode: true,
      shippingCity: true,
      items: {
        select: {
          productSlug: true,
          productName: true,
          quantity: true,
          markingTechniqueCode: true,
          markingColours: true,
        },
      },
    },
  });
  if (!carrito) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });
  if (carrito.items.length === 0) {
    return NextResponse.json({ error: "El carrito no tiene líneas" }, { status: 400 });
  }

  const margenes = await leerMargenes();
  const items: ItemResuelto[] = [];

  for (const item of carrito.items) {
    const producto = await prisma.product.findUnique({
      where: { slug: item.productSlug },
      select: {
        id: true,
        name: true,
        internalRef: true,
        material: true,
        lengthMm: true,
        widthMm: true,
        heightMm: true,
        primaryImageUrl: true,
        supplier: true,
        override: { select: { customName: true } },
        category: {
          select: {
            name: true,
            parent: { select: { name: true, parent: { select: { name: true } } } },
          },
        },
        variants: {
          where: { priceTiers: { some: {} } },
          take: 1,
          orderBy: { sku: "asc" },
          select: { priceTiers: { select: { minQty: true, unitPriceCents: true } } },
        },
        positions: {
          select: {
            positionId: true,
            maxWidthMm: true,
            maxHeightMm: true,
            techniques: { select: { technique: { select: { code: true, name: true } } } },
          },
        },
      },
    });

    const cantidad = Math.max(1, item.quantity);

    // Un producto despublicado o borrado no bloquea la conversión: la línea
    // entra con su nombre y su cantidad y sin coste, para teclearlo. Perder la
    // partida entera sería peor que perder el precio.
    if (!producto) {
      items.push({
        productName: item.productName,
        quantity: cantidad,
        imagenUrl: null,
        referencia: null,
        medidas: null,
        materiales: null,
        costeUnitCents: null,
        margenPct: margenes.pordefecto,
        marcaje: null,
      });
      continue;
    }

    const tiers = producto.variants[0]?.priceTiers ?? [];
    const coste = costeAlTramo(tiers, cantidad);
    const familias = [
      producto.category?.name,
      producto.category?.parent?.name,
      producto.category?.parent?.parent?.name,
    ].filter((n): n is string => typeof n === "string" && n.trim() !== "");
    const margenPct = margenDeJerarquia(margenes, familias);

    items.push({
      productName: publicProductName(producto.name, producto.override?.customName),
      quantity: cantidad,
      imagenUrl: proxyImageUrl(producto.primaryImageUrl),
      referencia: publicRef(producto),
      medidas: formatearMedidas(producto),
      materiales: producto.material,
      costeUnitCents: coste?.costeUnitCents ?? null,
      margenPct,
      marcaje: await marcajeDelItem({
        productId: producto.id,
        supplier: producto.supplier,
        posiciones: producto.positions,
        techniqueCode: item.markingTechniqueCode,
        tintas: Math.max(1, item.markingColours ?? 1),
        cantidad,
        costeProducto: coste?.costeUnitCents ?? 0,
      }),
    });
  }

  const entrada = entradaDesdeCarrito({
    contacto: carrito,
    items,
    margenObjetivoPct: margenes.pordefecto,
    validezDias: VALIDEZ_DIAS,
    plazoMinDias: PLAZO_MIN_DIAS,
    plazoMaxDias: PLAZO_MAX_DIAS,
    pvp: redondearPvpLimpio,
  });

  const sesion = await getAdminSession().catch(() => null);
  const creado = await crearPresupuesto(entrada, sesion?.email ?? null);

  // Rastro en el carrito, no en el documento: el número del presupuesto le
  // sirve a quien lleva el lead, y en la ficha del cliente no pinta nada.
  //
  // Si la nota falla, el presupuesto ya está creado y devolverlo es más útil
  // que reventar por una nota interna.
  await prisma.cartQuote
    .update({
      where: { id: carrito.id },
      data: {
        internalNotes: [
          `Presupuesto ${creado.numero} creado desde este carrito.`,
          carrito.internalNotes,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ id: creado.id, numero: creado.numero }, { status: 201 });
}

/**
 * Tarifica la técnica que el cliente eligió en la web.
 *
 * Misma cascada que el buscador del editor (`quoteMarkingNet`) y mismo
 * criterio: si no hay tarifa fiable, la línea entra a cero con su nombre para
 * teclearla, nunca con un precio inventado.
 */
async function marcajeDelItem(args: {
  productId: string;
  supplier: Parameters<typeof quoteMarkingNet>[0]["supplier"];
  posiciones: Array<{
    positionId: string;
    maxWidthMm: number | null;
    maxHeightMm: number | null;
    techniques: Array<{ technique: { code: string; name: string } }>;
  }>;
  techniqueCode: string | null;
  tintas: number;
  cantidad: number;
  costeProducto: number;
}): Promise<MarcajeParaLinea | null> {
  if (!args.techniqueCode) return null;
  const codigo = args.techniqueCode.trim().toUpperCase();

  // La posición con más área entre las que ofrecen esa técnica, igual que en
  // el buscador: las tarifas por cm² suben con el área.
  let elegida: { positionId: string; areaCm2: number | null; areaMaxima: string | null } | null =
    null;
  let nombre = codigo;
  for (const pos of args.posiciones) {
    const tec = pos.techniques.find((t) => t.technique.code.toUpperCase() === codigo);
    if (!tec) continue;
    nombre = tec.technique.name;
    const areaCm2 =
      pos.maxWidthMm && pos.maxHeightMm ? (pos.maxWidthMm * pos.maxHeightMm) / 100 : null;
    if (!elegida || (areaCm2 !== null && (elegida.areaCm2 === null || areaCm2 > elegida.areaCm2))) {
      elegida = {
        positionId: pos.positionId,
        areaCm2,
        areaMaxima: formatearArea(pos.maxWidthMm, pos.maxHeightMm),
      };
    }
  }

  const base = {
    codigo,
    nombre,
    tintas: args.tintas,
    areaCm2: elegida?.areaCm2 ?? null,
    posicion: elegida?.positionId ?? "",
    areaMaxima: elegida?.areaMaxima ?? null,
  };

  try {
    const cotizacion = await quoteMarkingNet({
      productId: args.productId,
      supplier: args.supplier,
      techniqueCode: codigo,
      quantity: args.cantidad,
      productNetUnitCents: args.costeProducto,
      printAreaCm2: base.areaCm2,
      numberOfColours: args.tintas,
    });
    if (!cotizacion.ok) {
      return {
        ...base,
        nombre: cotizacion.techniqueLabel || nombre,
        costeUnitCents: null,
        clicheCents: 0,
        aviso: cotizacion.warning ?? "Sin tarifa fiable: pide el coste al proveedor.",
      };
    }
    const { costeUnitCents, clicheCents } = desglosarMarcaje(cotizacion, args.cantidad);
    return {
      ...base,
      nombre: cotizacion.techniqueLabel || nombre,
      costeUnitCents,
      clicheCents,
      aviso: null,
    };
  } catch {
    return {
      ...base,
      costeUnitCents: null,
      clicheCents: 0,
      aviso: "La técnica no se pudo tarificar: pide el coste al proveedor.",
    };
  }
}
