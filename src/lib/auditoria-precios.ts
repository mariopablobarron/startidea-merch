import type { PrismaClient } from "@prisma/client";
import { applyMargin, marginMultiplier } from "@/lib/pricing";

/**
 * Auditoría del PRECIO PÚBLICO del catálogo, proveedor por proveedor.
 *
 * Contesta a una pregunta concreta: ¿el precio que ve el cliente sale de la
 * tarifa real del proveedor y lleva nuestro margen? Y si no, ¿en cuántos
 * productos y en cuáles.
 *
 * Solo LEE. Ni una escritura, a propósito: esto se ejecuta contra producción.
 *
 * Vive aquí y no dentro del script porque lo usan dos sitios —el script de
 * terminal y la página del panel— y una auditoría que cuenta una cosa por
 * consola y otra por pantalla no sirve para decidir nada.
 */

export const SUPPLIERS = ["midocean", "makito", "cifra", "adivin"] as const;
export type Supplier = (typeof SUPPLIERS)[number];

/** Descuento que aplica la curva inventada en el tramo de 250 uds. */
const FACTOR_250 = 0.32;

/** Una fila de la sección B. No se exporta: se lee desde `AuditoriaPrecios`. */
type ProductoSinTarifa = {
  slug: string;
  name: string;
  costeCents: number;
  desdeCents: number;
  /** Lo que cobraría la curva inventada a 250 uds. */
  a250Cents: number;
  /** El tramo de 250 sale por debajo de lo que nos cuesta. */
  bajoCoste: boolean;
};

/** Una fila de la sección C. No se exporta: se lee desde `AuditoriaPrecios`. */
type ProductoConHorquilla = {
  slug: string;
  name: string;
  variantes: number;
  minCents: number;
  maxCents: number;
  /** Cuánto más cara es la variante más cara, en porcentaje. */
  saltoPct: number;
};

export type AuditoriaPrecios = {
  generadaEn: string;
  margen: { multiplicador: number; sobreVentaPct: number };
  /** A · activos con `fromPriceCents` nulo o ≤ 0. Debería ser 0. */
  sinPrecio: { porProveedor: Record<Supplier, number>; total: number };
  /** B · activos con precio pero sin ningún tramo real de proveedor. */
  sinTarifa: {
    porProveedor: Record<Supplier, number>;
    total: number;
    ejemplos: Record<Supplier, ProductoSinTarifa[]>;
    /** Cuántos de los contados cobrarían por debajo del coste a 250 uds. */
    bajoCoste: number;
  };
  /** C · productos cuyas variantes no cuestan lo mismo. */
  horquillaVariantes: {
    porProveedor: Record<Supplier, number>;
    total: number;
    ejemplos: Record<Supplier, ProductoConHorquilla[]>;
  };
  /** D · Ádivin va a PVP del proveedor: su coste neto no está en la BD. */
  adivin: { activos: number; conPrecioFijado: number };
  /** E · margen que está aplicando la web de verdad. */
  margenEfectivo: Record<
    Supplier,
    { muestra: number; margenMedioPct: number | null; conPrecioFijado: number }
  >;
};

/** `Record<Supplier, T>` con el mismo valor de partida en los cuatro. */
function porProveedor<T>(inicial: () => T): Record<Supplier, T> {
  return Object.fromEntries(SUPPLIERS.map((s) => [s, inicial()])) as Record<Supplier, T>;
}

/**
 * El filtro de «sin tarifa real», en un solo sitio porque se usa para contar
 * y para listar ejemplos, y si los dos se separan cuentan cosas distintas.
 *
 * Se excluyen SOLO los que tienen el precio fijado a mano
 * (`customFromPriceCents`), que van con tarifa plana a propósito —Ádivin—. Un
 * override de otra cosa (etiquetas, por ejemplo) no cambia el precio y no debe
 * sacarlos de la cuenta.
 */
function filtroSinTarifa(supplier: Supplier) {
  return {
    supplier,
    active: true,
    fromPriceCents: { gt: 0 },
    variants: { none: { priceTiers: { some: {} } } },
    NOT: { override: { customFromPriceCents: { not: null } } },
  } as const;
}

export async function auditarPrecios(
  prisma: PrismaClient,
  opciones: { ejemplos?: number } = {},
): Promise<AuditoriaPrecios> {
  const EJEMPLOS = opciones.ejemplos ?? 8;

  const sinPrecioPorProveedor = porProveedor(() => 0);
  const sinTarifaPorProveedor = porProveedor(() => 0);
  const sinTarifaEjemplos = porProveedor<ProductoSinTarifa[]>(() => []);
  const horquillaPorProveedor = porProveedor(() => 0);
  const horquillaEjemplos = porProveedor<ProductoConHorquilla[]>(() => []);
  const margenEfectivo = porProveedor(() => ({
    muestra: 0,
    margenMedioPct: null as number | null,
    conPrecioFijado: 0,
  }));
  let bajoCoste = 0;

  for (const supplier of SUPPLIERS) {
    // ── A · activos sin precio ───────────────────────────────────────────
    sinPrecioPorProveedor[supplier] = await prisma.product.count({
      where: {
        supplier,
        active: true,
        OR: [{ fromPriceCents: null }, { fromPriceCents: { lte: 0 } }],
      },
    });

    // ── B · activos con precio pero sin tarifa real ──────────────────────
    const filtro = filtroSinTarifa(supplier);
    sinTarifaPorProveedor[supplier] = await prisma.product.count({ where: filtro });
    const muestraSinTarifa = await prisma.product.findMany({
      where: filtro,
      select: { slug: true, name: true, fromPriceCents: true },
      orderBy: { fromPriceCents: "desc" },
      take: EJEMPLOS,
    });
    sinTarifaEjemplos[supplier] = muestraSinTarifa.map((p) => {
      const costeCents = p.fromPriceCents ?? 0;
      const desdeCents = applyMargin(costeCents);
      const a250Cents = Math.round(desdeCents * FACTOR_250);
      return {
        slug: p.slug,
        name: p.name,
        costeCents,
        desdeCents,
        a250Cents,
        bajoCoste: a250Cents < costeCents,
      };
    });
    bajoCoste += sinTarifaEjemplos[supplier].filter((p) => p.bajoCoste).length;

    // ── C · variantes que no cuestan lo mismo ────────────────────────────
    const filas = await prisma.$queryRaw<
      Array<{ slug: string; name: string; min_cents: number; max_cents: number; variantes: bigint }>
    >`
      SELECT p.slug, p.name,
             MIN(v.min_cents) AS min_cents,
             MAX(v.min_cents) AS max_cents,
             COUNT(*)         AS variantes
      FROM "Product" p
      JOIN (
        SELECT pv."productId" AS product_id, pv.id, MIN(pt."unitPriceCents") AS min_cents
        FROM "ProductVariant" pv
        JOIN "PriceTier" pt ON pt."variantId" = pv.id
        GROUP BY pv."productId", pv.id
      ) v ON v.product_id = p.id
      WHERE p.active = true AND p.supplier::text = ${supplier}
      GROUP BY p.slug, p.name
      HAVING MIN(v.min_cents) <> MAX(v.min_cents)
      ORDER BY (MAX(v.min_cents) - MIN(v.min_cents)) DESC
    `;
    horquillaPorProveedor[supplier] = filas.length;
    horquillaEjemplos[supplier] = filas.slice(0, EJEMPLOS).map((f) => ({
      slug: f.slug,
      name: f.name,
      // `COUNT(*)` de Postgres llega como BigInt y JSON.stringify revienta con
      // él: se convierte aquí, que es donde se sabe de dónde viene.
      variantes: Number(f.variantes),
      minCents: f.min_cents,
      maxCents: f.max_cents,
      saltoPct: f.min_cents > 0 ? ((f.max_cents - f.min_cents) / f.min_cents) * 100 : 0,
    }));

    // ── E · margen efectivo sobre los que sí tienen tarifa ───────────────
    const muestra = await prisma.product.findMany({
      where: {
        supplier,
        active: true,
        fromPriceCents: { gt: 0 },
        variants: { some: { priceTiers: { some: {} } } },
      },
      select: {
        slug: true,
        fromPriceCents: true,
        override: { select: { customFromPriceCents: true, marginPct: true } },
      },
      take: 400,
    });
    const conPrecioFijado = muestra.filter(
      (p) => p.override?.customFromPriceCents != null || p.override?.marginPct != null,
    ).length;
    const margenes = muestra
      .filter((p) => p.override?.customFromPriceCents == null && p.override?.marginPct == null)
      .map((p) => {
        const coste = p.fromPriceCents ?? 0;
        const venta = applyMargin(coste);
        return venta > 0 ? ((venta - coste) / venta) * 100 : 0;
      });
    margenEfectivo[supplier] = {
      muestra: muestra.length,
      margenMedioPct: margenes.length
        ? margenes.reduce((a, b) => a + b, 0) / margenes.length
        : null,
      conPrecioFijado,
    };
  }

  // ── D · Ádivin ─────────────────────────────────────────────────────────
  const [adivinActivos, adivinConCustom] = await Promise.all([
    prisma.product.count({ where: { supplier: "adivin", active: true } }),
    prisma.productOverride.count({
      where: { customFromPriceCents: { not: null }, product: { supplier: "adivin" } },
    }),
  ]);

  const suma = (r: Record<Supplier, number>) => SUPPLIERS.reduce((t, s) => t + r[s], 0);

  return {
    generadaEn: new Date().toISOString(),
    margen: {
      multiplicador: marginMultiplier(),
      sobreVentaPct: (1 - 1 / marginMultiplier()) * 100,
    },
    sinPrecio: { porProveedor: sinPrecioPorProveedor, total: suma(sinPrecioPorProveedor) },
    sinTarifa: {
      porProveedor: sinTarifaPorProveedor,
      total: suma(sinTarifaPorProveedor),
      ejemplos: sinTarifaEjemplos,
      bajoCoste,
    },
    horquillaVariantes: {
      porProveedor: horquillaPorProveedor,
      total: suma(horquillaPorProveedor),
      ejemplos: horquillaEjemplos,
    },
    adivin: { activos: adivinActivos, conPrecioFijado: adivinConCustom },
    margenEfectivo,
  };
}
