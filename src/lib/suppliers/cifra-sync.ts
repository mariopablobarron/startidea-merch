/**
 * Sync completo del catálogo Cifra → BD.
 *
 * Patrón idéntico a midocean-sync: idempotente, upserts, transacciones por
 * chunks pequeños para no saturar Postgres ni Prisma client.
 *
 * Lo que hace:
 *   1. fetchProducts() → para cada producto: upsert `Product` (por
 *      supplier+supplierRef=rootmodel) + upsert `ProductVariant` (sku=model)
 *      con color resuelto del sufijo.
 *   2. fetchPriceTiers() → para cada model: upsert PriceTier por variant.id
 *      con source=CIFRA_PRICELIST.
 *   3. Refresh `Product.fromPriceCents` = MIN(unitPriceCents) de sus tiers
 *      (mismo patrón que aplicamos en midocean-sync tras el incidente fromPrice=0).
 *   4. Actualiza `SupplierSync` para tracking en admin.
 *
 * NO descarga printdata/marking-positions todavía — el JSON de Cifra solo
 * trae `tgrabacion` (técnica) y `mgrabacion` (medida) como strings sueltos.
 * Si Mario quiere posiciones de marcaje precisas (como con MidOcean), habrá
 * que pedirle a Cifra que añada un endpoint o hacerlo manual.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchProducts,
  fetchPriceTiers,
  priceStringToCents,
  cmStringToMm,
  extractColorSuffix,
  resolveColor,
  type CifraProduct,
} from "./cifra";

export type CifraSyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  productsFetched: number;
  productsUpserted: number;
  variantsUpserted: number;
  tiersUpserted: number;
  stockUpdated: number;
  fromPriceRefreshed: number;
  durationMs: number;
  errors: Array<{ ref: string; message: string }>;
};

const SUPPLIER = "cifra" as const;
const SLUG_PREFIX = "cif-"; // slug del producto: cif-<rootmodel>

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}

export async function runCifraSync(): Promise<CifraSyncResult> {
  const startedAt = new Date();
  const errors: CifraSyncResult["errors"] = [];
  let productsUpserted = 0;
  let variantsUpserted = 0;
  let tiersUpserted = 0;
  let stockUpdated = 0;

  // 1. Iniciar/actualizar SupplierSync (idempotente)
  await prisma.supplierSync.upsert({
    where: { supplier: SUPPLIER },
    create: { supplier: SUPPLIER, startedAt, ok: false },
    update: {
      startedAt,
      finishedAt: null,
      ok: false,
      productsFetched: 0,
      productsUpserted: 0,
      errorsJson: Prisma.DbNull,
    },
  });

  // 2. Fetch productos
  const products = await fetchProducts();

  // 3. Agrupar por rootmodel para tratar variantes como hijas de un producto raíz
  const byRoot = new Map<string, CifraProduct[]>();
  for (const p of products) {
    if (!p.name?.trim()) continue;
    if (!byRoot.has(p.rootmodel)) byRoot.set(p.rootmodel, []);
    byRoot.get(p.rootmodel)!.push(p);
  }

  // 4. Para cada rootmodel: upsert Product + sus variants
  const CHUNK = 50;
  const roots = Array.from(byRoot.keys());
  for (let i = 0; i < roots.length; i += CHUNK) {
    const chunk = roots.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (rootmodel) => {
        const variants = byRoot.get(rootmodel)!;
        const head = variants[0]!; // usamos el primero como "cabecera"
        try {
          // Categoría — upsert por nombre (tree plano de Cifra, level 1)
          let categoryId: string | null = null;
          if (head.category?.trim()) {
            const cat = await prisma.category.upsert({
              where: { parentId_slug: { parentId: null as never, slug: safeSlug(head.category) } },
              create: {
                slug: safeSlug(head.category),
                name: head.category.trim(),
                level: 1,
                parentId: null,
              },
              update: { name: head.category.trim() },
            });
            categoryId = cat.id;
          }

          // Upsert Product (rootmodel = supplierRef)
          const product = await prisma.product.upsert({
            where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: rootmodel } },
            create: {
              supplier: SUPPLIER,
              supplierRef: rootmodel,
              slug: `${SLUG_PREFIX}${safeSlug(rootmodel)}`,
              name: head.name.trim(),
              shortDescription: head.description?.trim() || null,
              category: categoryId ? { connect: { id: categoryId } } : undefined,
              supplierCategoryCode: head.category || null,
              weightG: parseFloat(head.pncaja || "0") > 0
                ? Math.round((parseFloat(head.pncaja!) * 1000) / (head.unacaja || 1))
                : null,
              lengthMm: cmStringToMm(head.length),
              widthMm: cmStringToMm(head.width),
              heightMm: cmStringToMm(head.height),
              primaryImageUrl: head.image || null,
              material: head.material?.trim() || null,
              tags: [],
              active: true,
              syncedAt: new Date(),
            },
            update: {
              name: head.name.trim(),
              shortDescription: head.description?.trim() || null,
              category: categoryId ? { connect: { id: categoryId } } : undefined,
              supplierCategoryCode: head.category || null,
              weightG: parseFloat(head.pncaja || "0") > 0
                ? Math.round((parseFloat(head.pncaja!) * 1000) / (head.unacaja || 1))
                : null,
              lengthMm: cmStringToMm(head.length),
              widthMm: cmStringToMm(head.width),
              heightMm: cmStringToMm(head.height),
              primaryImageUrl: head.image || null,
              material: head.material?.trim() || null,
              active: true,
              syncedAt: new Date(),
            },
          });
          productsUpserted++;

          // Variantes
          for (const v of variants) {
            const suffix = extractColorSuffix(v.model, rootmodel);
            const color = resolveColor(suffix);
            await prisma.productVariant.upsert({
              where: { sku: v.model },
              create: {
                product: { connect: { id: product.id } },
                sku: v.model,
                variantId: v.model,
                colorName: color.name,
                colorGroup: color.group,
                colorHex: color.hex,
                imageUrl: v.image || null,
                stockQty: typeof v.quantity === "number" ? v.quantity : 0,
                stockUpdatedAt: new Date(),
              },
              update: {
                colorName: color.name,
                colorGroup: color.group,
                colorHex: color.hex,
                imageUrl: v.image || null,
                stockQty: typeof v.quantity === "number" ? v.quantity : 0,
                stockUpdatedAt: new Date(),
              },
            });
            variantsUpserted++;
            stockUpdated++;
          }
        } catch (e) {
          errors.push({
            ref: rootmodel,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }),
    );
  }

  // 5. Pricelist — fetchPriceTiers + upsert por variant.sku=model
  try {
    const priceTiers = await fetchPriceTiers();
    // El endpoint /prices devuelve TODOS los modelos. Filtramos a los que
    // existen en BD (puede haber refs en pricelist que no están en /products
    // si el catálogo cambia entre llamadas).
    const variantsBySku = new Map<string, string>(); // sku → variantId
    const allVariants = await prisma.productVariant.findMany({
      where: { product: { supplier: SUPPLIER } },
      select: { id: true, sku: true },
    });
    for (const v of allVariants) variantsBySku.set(v.sku, v.id);

    for (const pt of priceTiers) {
      const variantId = variantsBySku.get(pt.model);
      if (!variantId || !pt.p_disc?.length) continue;
      // Upsert cada tier
      for (const tier of pt.p_disc) {
        if (!Number.isFinite(tier.quantity) || tier.quantity < 1) continue;
        await prisma.priceTier.upsert({
          where: { variantId_minQty: { variantId, minQty: tier.quantity } },
          create: {
            variantId,
            minQty: tier.quantity,
            unitPriceCents: priceStringToCents(tier.price),
            source: "CIFRA_PRICELIST",
          },
          update: {
            unitPriceCents: priceStringToCents(tier.price),
            source: "CIFRA_PRICELIST",
          },
        });
        tiersUpserted++;
      }
    }
  } catch (e) {
    errors.push({
      ref: "pricelist",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // 6. Refresh Product.fromPriceCents desde MIN(unitPriceCents) — mismo
  //    patrón que midocean-sync (post-incidente 2026-05-24).
  const fromPriceRefreshed = await prisma.$executeRaw`
    UPDATE "Product" p
    SET "fromPriceCents" = sub.min_price
    FROM (
      SELECT pv."productId" AS product_id, MIN(pt."unitPriceCents") AS min_price
      FROM "PriceTier" pt
      JOIN "ProductVariant" pv ON pv.id = pt."variantId"
      GROUP BY pv."productId"
    ) sub
    WHERE p.id = sub.product_id
      AND p.supplier = 'cifra'
      AND (p."fromPriceCents" IS NULL OR p."fromPriceCents" != sub.min_price)
  `;

  // 7. Finalizar SupplierSync
  const finishedAt = new Date();
  const result: CifraSyncResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ok: errors.length === 0,
    productsFetched: products.length,
    productsUpserted,
    variantsUpserted,
    tiersUpserted,
    stockUpdated,
    fromPriceRefreshed: Number(fromPriceRefreshed),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    errors: errors.slice(0, 50),
  };

  await prisma.supplierSync.update({
    where: { supplier: SUPPLIER },
    data: {
      finishedAt,
      ok: result.ok,
      productsFetched: products.length,
      productsUpserted,
      errorsJson: errors.length ? errors.slice(0, 100) : Prisma.DbNull,
    },
  });

  return result;
}
