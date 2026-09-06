#!/usr/bin/env bun
/**
 * Informe de consola de la auditoría de unidades del feed.
 *
 * El recuento NO está aquí: vive en `@/lib/auditoria-unidades-feed`, que es la
 * misma función que llama el cron `feed-units-watchdog`. Esto es solo el
 * formateo. Cuando el recuento estaba duplicado en dos sitios, las dos copias
 * acababan discrepando sobre la misma base de datos.
 *
 * Uso:
 *   bun scripts/audit-feed-units.ts            # informe
 *   bun scripts/audit-feed-units.ts --json     # salida para un cron
 *
 * Sale con código 1 si encuentra algo: sirve como comprobación post-import.
 */
import { prisma } from "@/lib/prisma";
import { auditarUnidadesFeed } from "@/lib/auditoria-unidades-feed";

const JSON_OUT = process.argv.includes("--json");

async function main() {
  const a = await auditarUnidadesFeed(prisma);

  if (JSON_OUT) {
    console.log(JSON.stringify(a, null, 2));
  } else {
    const log = (m: string) => console.log(m);

    log(`\nAuditoría de unidades del feed`);
    log(
      `  catálogo mirado: ${a.mirado.variantesActivas} variantes activas · ` +
        `${a.mirado.posicionesDeMarcaje} posiciones de marcaje\n`,
    );

    log(
      `  stock entre 1 y ${a.umbrales.stockMinimoPlausible - 1} uds: ${a.hallazgos.stockImplausible}`,
    );
    for (const v of a.muestras.stock) {
      log(
        `    ${(v.internalRef ?? "—").padEnd(12)} ${v.producto.slice(0, 40).padEnd(40)} ${String(v.stockQty).padStart(4)} uds`,
      );
    }

    log(
      `\n  áreas de marcaje por debajo de ${a.umbrales.areaMinimaMm} mm: ${a.hallazgos.areaMarcajeImplausible}`,
    );
    for (const p of a.muestras.area) {
      log(
        `    ${(p.internalRef ?? "—").padEnd(12)} ${p.producto.slice(0, 40).padEnd(40)} ${p.maxWidthMm} × ${p.maxHeightMm} mm`,
      );
    }

    log(`\n  tramos de precio con minQty entre 2 y 9: ${a.hallazgos.tramosImplausibles}`);

    log(
      a.hallazgos.total === 0
        ? `\n  → Nada sospechoso.\n`
        : `\n  → ${a.hallazgos.total} valores a revisar.\n`,
    );
  }

  process.exit(a.hallazgos.total > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
