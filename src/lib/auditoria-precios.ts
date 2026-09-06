import type { PrismaClient } from "@prisma/client";
import { clientFromPriceCents } from "@/lib/product-pricing";
import { marginMultiplier } from "@/lib/pricing";

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
 *
 * REGLA DE LA CASA: el precio publicado NO se modela aquí. Se pide a
 * `clientFromPriceCents`, que es la función que lo calcula de verdad. Una
 * auditoría con su propia idea de cómo se cobra acaba auditando su idea.
 */

export const SUPPLIERS = ["midocean", "makito", "cifra", "adivin"] as const;
export type Supplier = (typeof SUPPLIERS)[number];

/**
 * Por debajo de este margen sobre venta, una línea merece que alguien la mire.
 * No es un umbral de negocio cerrado: es el listón para que la sección E
 * señale con el dedo en vez de dar solo una media.
 */
const MARGEN_FLOJO_PCT = 25;

/** Una fila de la sección B. No se exporta: se lee desde `AuditoriaPrecios`. */
type ProductoSinTarifa = {
  slug: string;
  name: string;
  costeCents: number;
  /** Lo que ve el cliente, con el margen o el override que le toque. */
  desdeCents: number;
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

/** Una fila de la sección E. */
type ProductoConMargenFlojo = {
  slug: string;
  costeCents: number;
  desdeCents: number;
  margenPct: number;
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
    {
      muestra: number;
      margenMedioPct: number | null;
      conPrecioFijado: number;
      /** Umbral por debajo del cual se listan, para que se vea en pantalla. */
      umbralFlojoPct: number;
      flojos: ProductoConMargenFlojo[];
    }
  >;
};

/** `Record<Supplier, T>` a partir de una entrada por proveedor. */
function porProveedor<T>(pares: Array<[Supplier, T]>): Record<Supplier, T> {
  return Object.fromEntries(pares) as Record<Supplier, T>;
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

/**
 * El override tal y como lo espera `clientFromPriceCents`. `marketingTags` no
 * interviene en el precio «desde» —lo usan las promos—, pero se pide a la base
 * de datos en vez de rellenarlo a mano: un campo inventado para contentar al
 * tipo es un campo que un día alguien lee y se cree.
 */
type OverrideLeido = {
  customFromPriceCents: number | null;
  marginPct: number | null;
  marketingTags: string[];
} | null;

/** Margen sobre VENTA que deja un coste a un precio publicado. */
function margenSobreVenta(costeCents: number, desdeCents: number): number {
  return desdeCents > 0 ? ((desdeCents - costeCents) / desdeCents) * 100 : 0;
}

async function auditarProveedor(prisma: PrismaClient, supplier: Supplier, EJEMPLOS: number) {
  // ── A · activos sin precio ─────────────────────────────────────────────
  const sinPrecio = prisma.product.count({
    where: {
      supplier,
      active: true,
      OR: [{ fromPriceCents: null }, { fromPriceCents: { lte: 0 } }],
    },
  });

  // ── B · activos con precio pero sin tarifa real ────────────────────────
  const filtro = filtroSinTarifa(supplier);
  const sinTarifaCuenta = prisma.product.count({ where: filtro });
  const sinTarifaMuestra = prisma.product.findMany({
    where: filtro,
    select: {
      slug: true,
      name: true,
      fromPriceCents: true,
      override: { select: { customFromPriceCents: true, marginPct: true, marketingTags: true } },
    },
    orderBy: { fromPriceCents: "desc" },
    take: EJEMPLOS,
  });

  // ── C · variantes que no cuestan lo mismo ──────────────────────────────
  //
  // El total viaja en cada fila con `COUNT(*) OVER ()` y la consulta lleva
  // LIMIT: antes se traía el catálogo entero para acabar usando `.length`, que
  // en producción son miles de filas por proveedor y cuatro consultas.
  const horquilla = prisma.$queryRaw<
    Array<{
      slug: string;
      name: string;
      min_cents: number;
      max_cents: number;
      variantes: bigint;
      total: bigint;
    }>
  >`
    WITH por_variante AS (
      SELECT pv."productId" AS product_id, pv.id, MIN(pt."unitPriceCents") AS min_cents
      FROM "ProductVariant" pv
      JOIN "PriceTier" pt ON pt."variantId" = pv.id
      GROUP BY pv."productId", pv.id
    ), por_producto AS (
      SELECT p.slug, p.name,
             MIN(v.min_cents) AS min_cents,
             MAX(v.min_cents) AS max_cents,
             COUNT(*)         AS variantes
      FROM "Product" p
      JOIN por_variante v ON v.product_id = p.id
      WHERE p.active = true AND p.supplier::text = ${supplier}
      GROUP BY p.slug, p.name
      HAVING MIN(v.min_cents) <> MAX(v.min_cents)
    )
    SELECT *, COUNT(*) OVER () AS total
    FROM por_producto
    ORDER BY (max_cents - min_cents) DESC
    LIMIT ${EJEMPLOS}
  `;

  // ── E · margen efectivo sobre los que sí tienen tarifa ─────────────────
  //
  // Se miran TAMBIÉN los que llevan override. Excluirlos dejaba una cuenta
  // que solo podía dar el porcentaje configurado —el mismo número de entrada,
  // devuelto— y precisamente los que pueden desviarse son esos.
  const conTarifa = prisma.product.findMany({
    where: {
      supplier,
      active: true,
      fromPriceCents: { gt: 0 },
      variants: { some: { priceTiers: { some: {} } } },
    },
    select: {
      slug: true,
      fromPriceCents: true,
      override: { select: { customFromPriceCents: true, marginPct: true, marketingTags: true } },
    },
    take: 400,
  });

  const [nSinPrecio, nSinTarifa, muestraSinTarifa, filas, muestraConTarifa] = await Promise.all([
    sinPrecio,
    sinTarifaCuenta,
    sinTarifaMuestra,
    horquilla,
    conTarifa,
  ]);

  const ejemplosSinTarifa: ProductoSinTarifa[] = muestraSinTarifa.map((p) => {
    const costeCents = p.fromPriceCents ?? 0;
    return {
      slug: p.slug,
      name: p.name,
      costeCents,
      desdeCents: clientFromPriceCents(costeCents, p.override as OverrideLeido) ?? 0,
    };
  });

  const ejemplosHorquilla: ProductoConHorquilla[] = filas.map((f) => ({
    slug: f.slug,
    name: f.name,
    // `COUNT(*)` de Postgres llega como BigInt y JSON.stringify revienta con
    // él: se convierte aquí, que es donde se sabe de dónde viene.
    variantes: Number(f.variantes),
    minCents: f.min_cents,
    maxCents: f.max_cents,
    saltoPct: f.min_cents > 0 ? ((f.max_cents - f.min_cents) / f.min_cents) * 100 : 0,
  }));

  const margenes = muestraConTarifa.map((p) => {
    const costeCents = p.fromPriceCents ?? 0;
    const desdeCents = clientFromPriceCents(costeCents, p.override as OverrideLeido) ?? 0;
    return { slug: p.slug, costeCents, desdeCents, margenPct: margenSobreVenta(costeCents, desdeCents) };
  });

  return {
    supplier,
    sinPrecio: nSinPrecio,
    sinTarifa: nSinTarifa,
    ejemplosSinTarifa,
    horquilla: filas.length ? Number(filas[0].total) : 0,
    ejemplosHorquilla,
    margenEfectivo: {
      muestra: muestraConTarifa.length,
      margenMedioPct: margenes.length
        ? margenes.reduce((a, b) => a + b.margenPct, 0) / margenes.length
        : null,
      conPrecioFijado: muestraConTarifa.filter(
        (p) => p.override?.customFromPriceCents != null || p.override?.marginPct != null,
      ).length,
      umbralFlojoPct: MARGEN_FLOJO_PCT,
      flojos: margenes
        .filter((m) => m.margenPct < MARGEN_FLOJO_PCT)
        .sort((a, b) => a.margenPct - b.margenPct)
        .slice(0, EJEMPLOS),
    },
  };
}

export async function auditarPrecios(
  prisma: PrismaClient,
  opciones: { ejemplos?: number } = {},
): Promise<AuditoriaPrecios> {
  const EJEMPLOS = opciones.ejemplos ?? 8;

  // Los cuatro proveedores a la vez: en serie eran veinte consultas seguidas
  // contra el catálogo de producción, con el tiempo de la petición sumándolas.
  const [porSupplier, adivinActivos, adivinConCustom] = await Promise.all([
    Promise.all(SUPPLIERS.map((s) => auditarProveedor(prisma, s, EJEMPLOS))),
    prisma.product.count({ where: { supplier: "adivin", active: true } }),
    prisma.productOverride.count({
      where: { customFromPriceCents: { not: null }, product: { supplier: "adivin" } },
    }),
  ]);

  const campo = <T>(f: (r: (typeof porSupplier)[number]) => T) =>
    porProveedor(porSupplier.map((r) => [r.supplier, f(r)] as [Supplier, T]));
  const suma = (r: Record<Supplier, number>) => SUPPLIERS.reduce((t, s) => t + r[s], 0);

  const sinPrecioPorProveedor = campo((r) => r.sinPrecio);
  const sinTarifaPorProveedor = campo((r) => r.sinTarifa);
  const horquillaPorProveedor = campo((r) => r.horquilla);

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
      ejemplos: campo((r) => r.ejemplosSinTarifa),
    },
    horquillaVariantes: {
      porProveedor: horquillaPorProveedor,
      total: suma(horquillaPorProveedor),
      ejemplos: campo((r) => r.ejemplosHorquilla),
    },
    adivin: { activos: adivinActivos, conPrecioFijado: adivinConCustom },
    margenEfectivo: campo((r) => r.margenEfectivo),
  };
}
