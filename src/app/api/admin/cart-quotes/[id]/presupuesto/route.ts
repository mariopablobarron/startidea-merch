import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
import { requireRole } from "@/lib/admin-auth";
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
import { MAX_PARTIDAS } from "@/lib/presupuesto-schema";

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
    const auth = await requireRole(req, "COMERCIAL");
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
          // La variante y el color que el cliente eligió: el coste sale de SU
          // variante, no de la primera por orden alfabético, y en un textil
          // por tallas eso son precios distintos.
          variantSku: true,
          colorName: true,
          // Marcaje plano (una sola marca) y multi-marcaje.
          markingTechniqueCode: true,
          markingColours: true,
          markingPositionId: true,
          markings: {
            orderBy: { order: "asc" },
            select: {
              positionId: true,
              positionLabel: true,
              techniqueCode: true,
              techniqueName: true,
              numberOfColors: true,
              printAreaCm2: true,
            },
          },
        },
      },
    },
  });
  if (!carrito) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });
  if (carrito.items.length === 0) {
    return NextResponse.json({ error: "El carrito no tiene líneas" }, { status: 400 });
  }
  // Una partida por línea, y un presupuesto admite MAX_PARTIDAS. Se comprueba
  // ANTES de crear nada: si no, se creaba un documento que el editor rechazaba
  // en cada guardado y nadie entendía por qué.
  if (carrito.items.length > MAX_PARTIDAS) {
    return NextResponse.json(
      {
        error:
          `El carrito tiene ${carrito.items.length} líneas y un presupuesto admite ` +
          `${MAX_PARTIDAS} partidas. Agrupa líneas en el carrito o reparte la oferta en dos presupuestos.`,
      },
      { status: 400 },
    );
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
          orderBy: { sku: "asc" },
          select: { sku: true, priceTiers: { select: { minQty: true, unitPriceCents: true } } },
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
        marcajes: [],
      });
      continue;
    }

    // La variante que el cliente eligió manda sobre la primera con tarifa: en
    // un textil por tallas la XXL no cuesta lo que la S.
    const variante =
      producto.variants.find((v) => v.sku === item.variantSku) ?? producto.variants[0];
    const tiers = variante?.priceTiers ?? [];
    const coste = costeAlTramo(tiers, cantidad);
    const familias = [
      producto.category?.name,
      producto.category?.parent?.name,
      producto.category?.parent?.parent?.name,
    ].filter((n): n is string => typeof n === "string" && n.trim() !== "");
    const margenPct = margenDeJerarquia(margenes, familias);

    const nombre = publicProductName(producto.name, producto.override?.customName);
    items.push({
      // El color va en el concepto: dos líneas del mismo producto en colores
      // distintos son dos partidas, y en el documento tienen que distinguirse.
      productName: item.colorName ? `${nombre} · ${item.colorName}` : nombre,
      quantity: cantidad,
      imagenUrl: proxyImageUrl(producto.primaryImageUrl),
      referencia: publicRef(producto),
      medidas: formatearMedidas(producto),
      materiales: producto.material,
      costeUnitCents: coste?.costeUnitCents ?? null,
      margenPct,
      marcajes: await marcajesDelItem({
        productId: producto.id,
        supplier: producto.supplier,
        posiciones: producto.positions,
        marcas: marcasPedidas(item),
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

/** Una marca pedida por el cliente, venga del multi-marcaje o del campo plano. */
type MarcaPedida = {
  techniqueCode: string;
  techniqueName: string | null;
  positionId: string | null;
  tintas: number;
};

/**
 * Las marcas que el cliente pidió en esa línea del carrito.
 *
 * El carrito guarda multi-marcaje en `markings[]` y mantiene los campos planos
 * como espejo del primero. Si hay `markings`, mandan ellos —son todas las
 * marcas—; si no, la línea tiene como mucho la del campo plano.
 */
function marcasPedidas(item: {
  markingTechniqueCode: string | null;
  markingColours: number | null;
  markingPositionId: string | null;
  markings: Array<{
    positionId: string;
    positionLabel: string | null;
    techniqueCode: string;
    techniqueName: string | null;
    numberOfColors: number;
  }>;
}): MarcaPedida[] {
  if (item.markings.length > 0) {
    return item.markings.map((m) => ({
      techniqueCode: m.techniqueCode,
      techniqueName: m.techniqueName,
      positionId: m.positionId,
      tintas: Math.max(1, m.numberOfColors),
    }));
  }
  if (!item.markingTechniqueCode) return [];
  return [
    {
      techniqueCode: item.markingTechniqueCode,
      techniqueName: null,
      positionId: item.markingPositionId,
      tintas: Math.max(1, item.markingColours ?? 1),
    },
  ];
}

/**
 * Tarifica las marcas que el cliente eligió en la web.
 *
 * Misma cascada que el buscador del editor (`quoteMarkingNet`) y mismo
 * criterio: si no hay tarifa fiable, la línea entra a cero con su nombre para
 * teclearla, nunca con un precio inventado.
 *
 * La posición es LA QUE PIDIÓ el cliente, no la de más área. Elegir por él la
 * posición grande inflaría la tarifa por cm² y además pondría en la ficha un
 * sitio distinto del que va a llevar el logo. Solo si esa posición ya no está
 * en el catálogo se cae a la de más área, que es la prudente.
 */
async function marcajesDelItem(args: {
  productId: string;
  supplier: Parameters<typeof quoteMarkingNet>[0]["supplier"];
  posiciones: Array<{
    positionId: string;
    maxWidthMm: number | null;
    maxHeightMm: number | null;
    techniques: Array<{ technique: { code: string; name: string } }>;
  }>;
  marcas: MarcaPedida[];
  cantidad: number;
  costeProducto: number;
}): Promise<MarcajeParaLinea[]> {
  const marcajes: MarcajeParaLinea[] = [];
  for (const marca of args.marcas) {
    marcajes.push(
      await tarificarMarca({
        productId: args.productId,
        supplier: args.supplier,
        posiciones: args.posiciones,
        marca,
        cantidad: args.cantidad,
        costeProducto: args.costeProducto,
      }),
    );
  }
  return marcajes;
}

async function tarificarMarca(args: {
  productId: string;
  supplier: Parameters<typeof quoteMarkingNet>[0]["supplier"];
  posiciones: Array<{
    positionId: string;
    maxWidthMm: number | null;
    maxHeightMm: number | null;
    techniques: Array<{ technique: { code: string; name: string } }>;
  }>;
  marca: MarcaPedida;
  cantidad: number;
  costeProducto: number;
}): Promise<MarcajeParaLinea> {
  const codigo = args.marca.techniqueCode.trim().toUpperCase();

  const conEsaTecnica = args.posiciones.filter((pos) =>
    pos.techniques.some((t) => t.technique.code.toUpperCase() === codigo),
  );
  const nombreCatalogo = conEsaTecnica[0]?.techniques.find(
    (t) => t.technique.code.toUpperCase() === codigo,
  )?.technique.name;

  // La que pidió el cliente; si ya no existe, la de más área.
  const pedida = conEsaTecnica.find((pos) => pos.positionId === args.marca.positionId);
  const mayorArea = conEsaTecnica.reduce<(typeof conEsaTecnica)[number] | null>((mejor, pos) => {
    const area = pos.maxWidthMm && pos.maxHeightMm ? pos.maxWidthMm * pos.maxHeightMm : 0;
    const mejorArea =
      mejor?.maxWidthMm && mejor?.maxHeightMm ? mejor.maxWidthMm * mejor.maxHeightMm : -1;
    return area > mejorArea ? pos : mejor;
  }, null);
  const elegida = pedida ?? mayorArea;

  const areaCm2 =
    elegida?.maxWidthMm && elegida?.maxHeightMm
      ? (elegida.maxWidthMm * elegida.maxHeightMm) / 100
      : null;

  const base = {
    codigo,
    nombre: args.marca.techniqueName || nombreCatalogo || codigo,
    tintas: args.marca.tintas,
    areaCm2,
    posicion: elegida?.positionId ?? args.marca.positionId ?? "",
    areaMaxima: formatearArea(elegida?.maxWidthMm ?? null, elegida?.maxHeightMm ?? null),
  };

  try {
    const cotizacion = await quoteMarkingNet({
      productId: args.productId,
      supplier: args.supplier,
      techniqueCode: codigo,
      quantity: args.cantidad,
      productNetUnitCents: args.costeProducto,
      printAreaCm2: areaCm2,
      numberOfColours: args.marca.tintas,
    });
    if (!cotizacion.ok) {
      return {
        ...base,
        nombre: cotizacion.techniqueLabel || base.nombre,
        costeUnitCents: null,
        clicheCents: 0,
        aviso: cotizacion.warning ?? "Sin tarifa fiable: pide el coste al proveedor.",
      };
    }
    const { costeUnitCents, clicheCents } = desglosarMarcaje(cotizacion, args.cantidad);
    return {
      ...base,
      nombre: cotizacion.techniqueLabel || base.nombre,
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
