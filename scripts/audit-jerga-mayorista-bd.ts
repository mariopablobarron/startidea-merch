#!/usr/bin/env bun
/**
 * Barrido por descubrimiento de jerga mayorista en el catálogo ACTIVO.
 *
 * La lógica vive en `src/lib/audit-jerga-mayorista.ts` y el veredicto lo da el
 * saneador REAL (`supplierJargonHits`). Esto es solo la consola: lee, clasifica
 * y cuenta. **No escribe nada en la base de datos.**
 *
 * Contra producción (es donde está el dato que importa; el código es el mismo):
 *
 *   DATABASE_URL="postgres://…producción…" bun scripts/audit-jerga-mayorista-bd.ts
 *
 * Cómo se lee la salida — la distinción es el motivo de que esto exista:
 *
 *   · SUCIOS  → el saneador dice que es argumentario mayorista. Hay que actuar:
 *               ampliar el saneador si es una redacción nueva, y **reindexar a
 *               mano** después (`POST /api/cron/search-reindex`), porque el
 *               índice de búsqueda guarda su propia copia del texto.
 *   · MIRADOS → campos que hablan de distribuidores/márgenes y están limpios.
 *               Es castellano legítimo («diseño exclusivo»). Este número es lo
 *               que permite decir «no queda ninguna» en vez de «ninguna de las
 *               que miré».
 *
 * Salida 1 si hay algo sucio, para poder colgarlo de un cron sin leerlo a ojo.
 */

import { PrismaClient } from "@prisma/client";
import { barrerJergaMayorista, type FichaTexto } from "../src/lib/audit-jerga-mayorista";

const prisma = new PrismaClient();

async function main() {
  const fichas = (await prisma.product.findMany({
    where: { active: true },
    select: {
      slug: true,
      name: true,
      shortDescription: true,
      longDescription: true,
      enhancedShortDescription: true,
      material: true,
    },
  })) as FichaTexto[];

  const r = barrerJergaMayorista(fichas);

  console.log(`\nBarrido de jerga mayorista — catálogo ACTIVO`);
  console.log(`  fichas activas ....... ${r.fichas}`);
  console.log(`  campos con texto ..... ${r.camposRevisados}`);
  console.log(`  mencionan el tema .... ${r.camposConAncla}`);
  console.log(`  …y están limpios ..... ${r.camposLimpiosConAncla} (castellano legítimo)`);
  console.log(`  SUCIOS ............... ${r.sucios.length} en ${r.slugsSucios.length} fichas\n`);

  if (r.sucios.length === 0) {
    console.log("\x1b[32m✓ Ninguna ficha activa publica argumentario mayorista.\x1b[0m");
    console.log("  (dicho sobre TODAS las activas, no sobre una lista de casos conocidos)\n");
    return 0;
  }

  for (const h of r.sucios) {
    console.log(`\x1b[31m  ✗ ${h.slug} · ${h.campo}\x1b[0m`);
    console.log(`      detectado: ${h.hits.map((x) => `«${x}»`).join(", ")}`);
    console.log(`      contexto:  ${h.extracto}`);
  }
  console.log(
    `\n  Tras arreglarlo hay que reindexar A MANO: POST /api/cron/search-reindex ` +
      `(cabecera x-cron-secret). El índice guarda copia del texto.\n`,
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
