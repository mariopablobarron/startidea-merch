#!/usr/bin/env bun
/**
 * Backfill + CANONICALIZACIÓN de ProductVariant.colorGroup.
 *
 * Dos problemas que resuelve (auditoría 07-2026):
 *   1. Makito dejaba colorGroup a null y Cifra fallaba con sufijos fuera del
 *      dict → ~64% del catálogo fuera del filtro de color.
 *   2. Cada proveedor escribía un vocabulario DISTINTO para el mismo color:
 *      MidOcean "Azul"/"Marrón"/"Purple"/"Oro" (mayúscula/inglés), Cifra
 *      "marrón"/"lila" (minúscula/tilde). El filtro agrupa con groupBy(colorGroup)
 *      sobre el string exacto y Postgres no pliega acentos → facetas partidas.
 *
 * Recalcula el grupo canónico de CADA variante con las MISMAS funciones que los
 * syncs (canonicalColorGroup del grupo existente, o colorGroupFromName del
 * nombre si no hay grupo) y solo escribe donde difiere del valor actual. Nunca
 * pone a null un grupo que ya existía.
 *
 * Ejecutar tras desplegar el fix de los syncs:
 *   bun scripts/backfill-color-group.ts          # aplica
 *   bun scripts/backfill-color-group.ts --dry     # solo cuenta
 */
import { prisma } from "@/lib/prisma";
import { colorGroupFromName, canonicalColorGroup } from "@/lib/variant-grouping";

const DRY = process.argv.includes("--dry");

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { OR: [{ colorGroup: { not: null } }, { colorName: { not: null } }] },
    select: { id: true, colorName: true, colorGroup: true },
  });
  console.log(`Variantes con color (grupo o nombre): ${variants.length}`);

  const byGroup = new Map<string, number>();
  const updates: { id: string; group: string }[] = [];
  let unchanged = 0;
  let stillNull = 0;

  for (const v of variants) {
    // Canoniza el grupo existente; si no había, deriva del nombre.
    const target = canonicalColorGroup(v.colorGroup) ?? colorGroupFromName(v.colorName);
    if (target === v.colorGroup) {
      unchanged++;
      continue;
    }
    if (!target) {
      // Solo puede pasar si colorGroup era null y el nombre es ruido → se queda null.
      stillNull++;
      continue;
    }
    byGroup.set(target, (byGroup.get(target) ?? 0) + 1);
    updates.push({ id: v.id, group: target });
  }

  console.log(
    `A cambiar: ${updates.length} · ya canónicas: ${unchanged} · sin familia (ruido): ${stillNull}`,
  );
  console.log(
    "Grupos destino:",
    [...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(" · "),
  );

  if (DRY) {
    console.log("[dry-run] no se escribe nada.");
    return;
  }

  // updateMany por grupo destino en trozos de 1000 ids (evita IN gigantes).
  const idsByGroup = new Map<string, string[]>();
  for (const u of updates) {
    const arr = idsByGroup.get(u.group) ?? [];
    arr.push(u.id);
    idsByGroup.set(u.group, arr);
  }

  let written = 0;
  for (const [group, ids] of idsByGroup) {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const res = await prisma.productVariant.updateMany({
        where: { id: { in: chunk } },
        data: { colorGroup: group },
      });
      written += res.count;
    }
  }
  console.log(`✅ colorGroup canonicalizado en ${written} variantes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
