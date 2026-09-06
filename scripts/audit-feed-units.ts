#!/usr/bin/env bun
/**
 * Audita el catálogo ENTERO buscando los valores que dejó el ÷1.000 del feed:
 * stock y áreas de marcaje con la escala rota.
 *
 * Los tests fijan el parser; esto comprueba el resultado real después de
 * reimportar, que es la otra mitad: un producto puede seguir con el valor malo
 * en BD porque su proveedor no ha vuelto a sincronizar.
 *
 * Qué busca:
 *   1. Variantes activas con stock entre 1 y 9 → un producto que se vende con
 *      tres unidades es casi siempre "3.000" leído como 3.
 *   2. Posiciones de marcaje con algún lado < 5 mm → no hay técnica que imprima
 *      eso; es el área en cm guardada como mm.
 *   3. Tramos de precio con minQty entre 2 y 9 → "1.000" leído como 1 deja el
 *      precio de mil unidades cotizando desde la primera.
 *
 * Uso:
 *   bun scripts/audit-feed-units.ts            # informe
 *   bun scripts/audit-feed-units.ts --json     # salida para un cron
 *
 * Sale con código 1 si encuentra algo: sirve como comprobación post-import.
 */
import { prisma } from "@/lib/prisma";
import { AREA_MARCAJE_MINIMA_MM, STOCK_MINIMO_PLAUSIBLE } from "@/lib/suppliers/feed-units";

const JSON_OUT = process.argv.includes("--json");
const LIMITE_MUESTRA = 25;

function log(m: string) {
  if (!JSON_OUT) console.log(m);
}

async function main() {
  const stockSospechoso = await prisma.productVariant.findMany({
    where: {
      stockQty: { gt: 0, lt: STOCK_MINIMO_PLAUSIBLE },
      product: { active: true },
    },
    select: {
      sku: true,
      stockQty: true,
      product: { select: { internalRef: true, name: true, supplier: true } },
    },
    take: LIMITE_MUESTRA,
  });
  const stockTotal = await prisma.productVariant.count({
    where: { stockQty: { gt: 0, lt: STOCK_MINIMO_PLAUSIBLE }, product: { active: true } },
  });

  const areaSospechosa = await prisma.markingPosition.findMany({
    where: {
      OR: [
        { maxWidthMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
        { maxHeightMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
      ],
    },
    select: {
      positionId: true,
      maxWidthMm: true,
      maxHeightMm: true,
      product: { select: { internalRef: true, name: true, supplier: true } },
    },
    take: LIMITE_MUESTRA,
  });
  const areaTotal = await prisma.markingPosition.count({
    where: {
      OR: [
        { maxWidthMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
        { maxHeightMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
      ],
    },
  });

  const tramoTotal = await prisma.priceTier.count({ where: { minQty: { gt: 1, lt: 10 } } });

  // Contexto: cuánto catálogo se ha mirado, para que un "0 hallazgos" sobre
  // una tabla vacía no se lea como "todo correcto".
  const variantesActivas = await prisma.productVariant.count({ where: { product: { active: true } } });
  const posiciones = await prisma.markingPosition.count();

  const resumen = {
    variantesActivas,
    posicionesDeMarcaje: posiciones,
    stockImplausible: stockTotal,
    areaMarcajeImplausible: areaTotal,
    tramosImplausibles: tramoTotal,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ resumen, stockSospechoso, areaSospechosa }, null, 2));
  } else {
    log(`\nAuditoría de unidades del feed`);
    log(`  catálogo mirado: ${variantesActivas} variantes activas · ${posiciones} posiciones de marcaje\n`);

    log(`  stock entre 1 y ${STOCK_MINIMO_PLAUSIBLE - 1} uds: ${stockTotal}`);
    for (const v of stockSospechoso) {
      log(`    ${(v.product.internalRef ?? "—").padEnd(12)} ${v.product.name.slice(0, 40).padEnd(40)} ${String(v.stockQty).padStart(4)} uds`);
    }

    log(`\n  áreas de marcaje por debajo de ${AREA_MARCAJE_MINIMA_MM} mm: ${areaTotal}`);
    for (const p of areaSospechosa) {
      log(`    ${(p.product.internalRef ?? "—").padEnd(12)} ${p.product.name.slice(0, 40).padEnd(40)} ${p.maxWidthMm} × ${p.maxHeightMm} mm`);
    }

    log(`\n  tramos de precio con minQty entre 2 y 9: ${tramoTotal}`);

    const total = stockTotal + areaTotal + tramoTotal;
    log(total === 0 ? `\n  → Nada sospechoso.\n` : `\n  → ${total} valores a revisar.\n`);
  }

  process.exit(resumen.stockImplausible + resumen.areaMarcajeImplausible + resumen.tramosImplausibles > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
