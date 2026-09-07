/**
 * Auditoría de las unidades del feed — la que busca lo que dejó el ÷1.000.
 *
 * REGLA DE LA CASA: los umbrales no se escriben aquí. Salen de
 * `@/lib/suppliers/feed-units`, que es donde vive el parser que provocó el
 * incidente. Una auditoría con sus propios umbrales acaba auditando su idea
 * de lo que es plausible, no la del código que importa los feeds.
 *
 * Vive en `src/lib` y no en `scripts/` por el mismo motivo que
 * `auditoria-precios.ts`: la miran dos sitios —el script de consola y el cron
 * que la vigila sola— y dos copias del mismo recuento acaban dando dos cifras
 * distintas sobre la misma base de datos.
 *
 * Los tres síntomas son del mismo fallo de escala:
 *
 *   · stock entre 1 y 9 uds en un producto ACTIVO → "3.000" leído como 3.
 *   · área de marcaje por debajo de 5 mm → los centímetros del API de marcaje
 *     escritos tal cual en un campo que está en milímetros.
 *   · tramo de precio que arranca entre 2 y 9 → "1.000" leído como 1, con lo
 *     que el precio de mil unidades cotiza desde la primera.
 *
 * Ninguno de los tres se arregla aquí: esto cuenta, no toca nada.
 *
 * Los tres dan MUESTRA, no solo recuento. Saber que hay «3 tramos
 * implausibles» sin saber de qué productos obliga a abrir una consola contra
 * producción — que es exactamente lo que el watchdog vino a quitar de en
 * medio. El tramo es además el síntoma que cuesta dinero solo: un tramo que
 * arranca en 5 en vez de en 5.000 aplica el precio de cinco mil unidades desde
 * la quinta, y eso sale por la puerta dentro de un presupuesto.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { AREA_MARCAJE_MINIMA_MM, STOCK_MINIMO_PLAUSIBLE } from "@/lib/suppliers/feed-units";

/** Tope de ejemplos por síntoma. El recuento es completo; la muestra, no. */
export const EJEMPLOS = 25;

type MuestraStock = {
  supplier: string;
  internalRef: string | null;
  producto: string;
  sku: string;
  stockQty: number;
};

/**
 * Sin `unitPriceCents` a propósito: ese es el COSTE neto de proveedor. Para
 * ver que una cantidad tiene la escala rota basta la cantidad, y este informe
 * acaba impreso en el log de GitHub Actions por el cron. El coste al que
 * compramos no viaja a un log por comodidad de lectura.
 */
type MuestraTramo = {
  supplier: string;
  internalRef: string | null;
  producto: string;
  sku: string;
  minQty: number;
};

type MuestraArea = {
  supplier: string;
  internalRef: string | null;
  producto: string;
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
};

export type AuditoriaUnidadesFeed = {
  generadaEn: string;
  umbrales: { stockMinimoPlausible: number; areaMinimaMm: number };
  /**
   * Cuánto catálogo se ha mirado. Sin esto, un "0 hallazgos" sobre una tabla
   * vacía se lee igual que un catálogo sano, que es justo el error que hace
   * inútil a una auditoría.
   */
  mirado: { variantesActivas: number; posicionesDeMarcaje: number };
  hallazgos: {
    stockImplausible: number;
    areaMarcajeImplausible: number;
    tramosImplausibles: number;
    total: number;
  };
  muestras: { stock: MuestraStock[]; area: MuestraArea[]; tramos: MuestraTramo[] };
};

/** Variantes vivas con un stock que no puede ser cierto. */
const dondeStockImplausible: Prisma.ProductVariantWhereInput = {
  stockQty: { gt: 0, lt: STOCK_MINIMO_PLAUSIBLE },
  product: { active: true },
};

/**
 * Un tramo que arranca entre 2 y 9. Ojo: `minQty: 1` NO entra, y no puede
 * entrar — es el tramo base legítimo de todo producto, así que un «1.000»
 * leído como 1 es indistinguible de lo normal. Lo que se caza aquí son sus
 * hermanos: 2.000 → 2, 5.000 → 5.
 */
const dondeTramoImplausible: Prisma.PriceTierWhereInput = { minQty: { gt: 1, lt: 10 } };

/** Un área con CUALQUIER lado por debajo del mínimo imprimible. */
const dondeAreaImplausible: Prisma.MarkingPositionWhereInput = {
  OR: [
    { maxWidthMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
    { maxHeightMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
  ],
};

export async function auditarUnidadesFeed(
  prisma: Pick<PrismaClient, "productVariant" | "markingPosition" | "priceTier">,
): Promise<AuditoriaUnidadesFeed> {
  const [
    variantesActivas,
    posicionesDeMarcaje,
    stockImplausible,
    areaMarcajeImplausible,
    tramosImplausibles,
    muestraStock,
    muestraArea,
    muestraTramos,
  ] = await Promise.all([
    prisma.productVariant.count({ where: { product: { active: true } } }),
    prisma.markingPosition.count(),
    prisma.productVariant.count({ where: dondeStockImplausible }),
    prisma.markingPosition.count({ where: dondeAreaImplausible }),
    prisma.priceTier.count({ where: dondeTramoImplausible }),
    prisma.productVariant.findMany({
      where: dondeStockImplausible,
      select: {
        sku: true,
        stockQty: true,
        product: { select: { internalRef: true, name: true, supplier: true } },
      },
      orderBy: { stockQty: "asc" },
      take: EJEMPLOS,
    }),
    prisma.markingPosition.findMany({
      where: dondeAreaImplausible,
      select: {
        positionId: true,
        maxWidthMm: true,
        maxHeightMm: true,
        product: { select: { internalRef: true, name: true, supplier: true } },
      },
      take: EJEMPLOS,
    }),
    prisma.priceTier.findMany({
      where: dondeTramoImplausible,
      select: {
        minQty: true,
        variant: {
          select: {
            sku: true,
            product: { select: { internalRef: true, name: true, supplier: true } },
          },
        },
      },
      orderBy: { minQty: "asc" },
      take: EJEMPLOS,
    }),
  ]);

  return {
    generadaEn: new Date().toISOString(),
    umbrales: {
      stockMinimoPlausible: STOCK_MINIMO_PLAUSIBLE,
      areaMinimaMm: AREA_MARCAJE_MINIMA_MM,
    },
    mirado: { variantesActivas, posicionesDeMarcaje },
    hallazgos: {
      stockImplausible,
      areaMarcajeImplausible,
      tramosImplausibles,
      total: stockImplausible + areaMarcajeImplausible + tramosImplausibles,
    },
    muestras: {
      stock: muestraStock.map((v) => ({
        supplier: v.product.supplier,
        internalRef: v.product.internalRef,
        producto: v.product.name,
        sku: v.sku,
        stockQty: v.stockQty,
      })),
      area: muestraArea.map((p) => ({
        supplier: p.product.supplier,
        internalRef: p.product.internalRef,
        producto: p.product.name,
        positionId: p.positionId,
        maxWidthMm: p.maxWidthMm,
        maxHeightMm: p.maxHeightMm,
      })),
      tramos: muestraTramos.map((t) => ({
        supplier: t.variant.product.supplier,
        internalRef: t.variant.product.internalRef,
        producto: t.variant.product.name,
        sku: t.variant.sku,
        minQty: t.minQty,
      })),
    },
  };
}
