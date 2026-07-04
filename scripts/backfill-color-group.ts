#!/usr/bin/env bun
/**
 * Backfill de ProductVariant.colorGroup para las variantes que lo tienen NULL
 * pero SÍ tienen colorName (Makito lo dejaba a null; Cifra falla cuando el
 * sufijo no está en su diccionario). Sin grupo, el producto queda FUERA del
 * filtro de color del catálogo (excluía ~64% del catálogo — auditoría 07-2026).
 *
 * Deriva el grupo con la MISMA función que ahora usan los syncs
 * (colorGroupFromName), así el backfill y las sincronizaciones futuras coinciden.
 *
 * Ejecutar UNA vez tras desplegar el fix de los syncs:
 *   bun scripts/backfill-color-group.ts          # aplica
 *   bun scripts/backfill-color-group.ts --dry     # solo cuenta
 */
import { prisma } from "@/lib/prisma";
import { colorGroupFromName } from "@/lib/variant-grouping";

const DRY = process.argv.includes("--dry");

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { colorGroup: null, colorName: { not: null } },
    select: { id: true, colorName: true },
  });
  console.log(`Variantes con colorGroup null y colorName presente: ${variants.length}`);

  let resolved = 0;
  let unresolved = 0;
  const byGroup = new Map<string, number>();
  const updates: { id: string; group: string }[] = [];

  for (const v of variants) {
    const group = colorGroupFromName(v.colorName);
    if (!group) {
      unresolved++;
      continue;
    }
    resolved++;
    byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
    updates.push({ id: v.id, group });
  }

  console.log(`Resolubles: ${resolved} · sin familia (ruido/desconocido): ${unresolved}`);
  console.log(
    "Por familia:",
    [...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(" · "),
  );

  if (DRY) {
    console.log("[dry-run] no se escribe nada.");
    return;
  }

  // Update por familia (un updateMany por grupo) — muchísimo menos round-trips
  // que uno por fila. Reagrupamos los ids por grupo destino.
  const idsByGroup = new Map<string, string[]>();
  for (const u of updates) {
    const arr = idsByGroup.get(u.group) ?? [];
    arr.push(u.id);
    idsByGroup.set(u.group, arr);
  }

  let written = 0;
  for (const [group, ids] of idsByGroup) {
    // Trozos de 1000 ids para no pasarse con el tamaño del IN.
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const res = await prisma.productVariant.updateMany({
        where: { id: { in: chunk } },
        data: { colorGroup: group },
      });
      written += res.count;
    }
  }
  console.log(`✅ colorGroup escrito en ${written} variantes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
