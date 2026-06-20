// Sincronización inicial / bootstrap de productos del catálogo del merch a
// FacturaScripts. Idempotente: si la `referencia` ya existe en FS, hace UPDATE.
//
// Uso:
//   pnpm exec tsx scripts/sync-products-to-fs.ts          # dry-run
//   pnpm exec tsx scripts/sync-products-to-fs.ts --apply  # ejecuta upsert real
//
// Requisitos: FACTURASCRIPTS_URL y FACTURASCRIPTS_API_KEY en .env.

import { prisma } from "@/lib/prisma";
import { facturaScripts, FSError, FS_IDEMPRESA } from "@/lib/facturascripts";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.SYNC_LIMIT || 0); // 0 = todos

async function main() {
  console.log(`[sync-products-to-fs] modo=${APPLY ? "APPLY" : "DRY-RUN"} idempresa=${FS_IDEMPRESA}`);

  const where = { active: true } as const;
  const total = await prisma.product.count({ where });
  console.log(`[sync-products-to-fs] productos activos en merch: ${total}`);

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      slug: true,
      name: true,
      supplierRef: true,
      internalRef: true,
      fromPriceCents: true,
    },
    orderBy: { createdAt: "desc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ id: string; ref: string; error: string }> = [];

  for (const p of products) {
    // Preferimos internalRef (referencia visible al cliente) sobre supplierRef.
    // Truncamos a 30 chars (límite de FacturaScripts).
    const ref = ((p.internalRef && p.internalRef.trim()) || p.supplierRef || p.slug).slice(0, 30);
    const precio = (p.fromPriceCents ?? 0) / 100;
    const descripcion = p.name.slice(0, 200);

    if (!precio) {
      console.log(`  SKIP ${ref}  (sin fromPriceCents): ${p.name}`);
      skipped++;
      continue;
    }

    if (!APPLY) {
      console.log(`  DRY  ${ref}  ${precio.toFixed(2)} €  ${descripcion}`);
      ok++;
      continue;
    }

    try {
      await facturaScripts.upsertProducto({
        referencia: ref,
        descripcion,
        precio,
        codimpuesto: "IVA21",
        idempresa: FS_IDEMPRESA,
      });
      console.log(`  OK   ${ref}  ${precio.toFixed(2)} €`);
      ok++;
    } catch (err) {
      const msg = err instanceof FSError ? `${err.status} ${err.body.slice(0, 120)}` : String(err);
      console.error(`  FAIL ${ref}: ${msg}`);
      errors.push({ id: p.id, ref, error: msg });
      failed++;
    }
  }

  console.log("");
  console.log(`Resumen: ok=${ok} skipped=${skipped} failed=${failed}`);
  if (errors.length) {
    console.log("Errores:");
    for (const e of errors.slice(0, 20)) console.log(`  - ${e.ref}: ${e.error}`);
    if (errors.length > 20) console.log(`  …+${errors.length - 20} más`);
  }

  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("[sync-products-to-fs] fatal:", err);
  process.exit(1);
});
