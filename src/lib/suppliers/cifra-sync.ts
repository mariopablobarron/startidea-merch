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
import {
  recordSupplierSyncRun,
  checkAndAlertSupplierDegradation,
  rescueOrphanedSyncRun,
} from "./sync-history";
import { meiliEnabled, reindexAllProducts } from "@/lib/search/meili";
import { Prisma } from "@prisma/client";
import { colorGroupFromName, canonicalColorGroup } from "@/lib/variant-grouping";
import { createSyncBreaker } from "@/lib/sync-circuit-breaker";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import {
  fetchProducts,
  fetchPriceTiers,
  priceStringToCents,
  cmStringToMm,
  type CifraProduct,
} from "./cifra";
import { parseCifraVariantDimensions } from "./cifra-variant";
// Reusamos el slug-builder de midocean: SEO-clean a partir del nombre,
// resolución de colisión con sufijos -2, -3... Importante para cumplir
// regla anti-supplier-leak (no exponer "cif-" en URLs públicas).
import { resolveCleanProductSlug } from "./midocean-sync";
import { sanitizeSupplierText, sanitizeSupplierName } from "./sanitize-supplier-text";
import { withSyncFailureClosing } from "./sync-failure";
// Proxy de imágenes: registra el original en MediaAsset y devuelve
// `/api/m/<hash>` opaco. CRÍTICO: publicatalogue.com delata a Cifra,
// nunca debe llegar al HTML público (regla anti-supplier-leak).
import { ensureMediaAsset } from "@/lib/proxy-image";

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
// Legacy slug prefix — solo usado para detectar slugs viejos y reemplazarlos.
// Los productos nuevos van con slug limpio basado en el nombre (mismo patrón
// que midocean) para no filtrar el proveedor en la URL pública.
const LEGACY_SLUG_PREFIX = "cif-";

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}

function toQty(q: unknown): number {
  // El feed de Cifra manda quantity a veces como number y a veces como STRING
  // ("123"). El guard typeof===number colapsaba TODO el stock a 0 (auditoría
  // 2026-07-04: 100% del stock Cifra a cero con sync verde).
  if (typeof q === "number" && Number.isFinite(q)) return Math.max(0, Math.trunc(q));
  const n = parseInt(String(q ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function runCifraSync(): Promise<CifraSyncResult> {
  return withSyncFailureClosing(
    "cifra-sync",
    (data) => prisma.supplierSync.update({ where: { supplier: SUPPLIER }, data }),
    runCifraSyncInner,
  );
}

async function runCifraSyncInner(): Promise<CifraSyncResult> {
  const startedAt = new Date();
  const errors: CifraSyncResult["errors"] = [];
  let productsUpserted = 0;
  let variantsUpserted = 0;
  let tiersUpserted = 0;
  let stockUpdated = 0;

  // Antes de pisar la fila: si la ejecución anterior murió sin cerrar, dejar
  // constancia en el histórico. Este `upsert` es lo que borra la evidencia.
  await rescueOrphanedSyncRun(SUPPLIER, startedAt);

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
  // Cache de categorías root (parentId=null) — evita rehacer findFirst por cada
  // producto y replica el patrón de midocean-sync. Mismo fix que aplicamos a
  // ese sync: el compound unique parentId_slug NO se puede consultar con
  // parentId=null en Prisma 6 ("Argument `parentId` must not be null"); hay que
  // usar findFirst + create.
  const categoryCache = new Map<string, string>(); // slug → categoryId

  async function resolveRootCategory(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const slug = safeSlug(trimmed);
    const cached = categoryCache.get(slug);
    if (cached) return cached;
    const existing = await prisma.category.findFirst({
      where: { parentId: null, slug },
      select: { id: true },
    });
    if (existing) {
      categoryCache.set(slug, existing.id);
      return existing.id;
    }
    try {
      const created = await prisma.category.create({
        data: { slug, name: trimmed, level: 1, parentId: null },
      });
      categoryCache.set(slug, created.id);
      return created.id;
    } catch (e) {
      // Race: otra Promise del mismo chunk creó la misma categoría a la vez.
      // Releemos.
      const again = await prisma.category.findFirst({
        where: { parentId: null, slug },
        select: { id: true },
      });
      if (again) {
        categoryCache.set(slug, again.id);
        return again.id;
      }
      throw e;
    }
  }

  const CHUNK = 50;
  const roots = Array.from(byRoot.keys());
  const breaker = createSyncBreaker();
  for (let i = 0; i < roots.length; i += CHUNK) {
    const chunk = roots.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (rootmodel) => {
        const variants = byRoot.get(rootmodel)!;
        const head = variants[0]!; // usamos el primero como "cabecera"
        try {
          const categoryId = head.category?.trim()
            ? await resolveRootCategory(head.category)
            : null;

          // Una única fuente limpia para persistencia y slugs nuevos. Antes el
          // nombre se saneaba al escribir, pero el slug nacía de head.name crudo
          // y convertía <p>Nombre</p> en URLs pnombrep.
          const cleanName = sanitizeSupplierName(head.name);

          // Slug limpio: si ya existe el producto y no usa el prefijo cif-, lo
          // preservamos. Los artefactos históricos pnombre[p] se migran con el
          // endpoint one-shot que además conserva redirect; el sync no debe
          // cambiar URLs públicas silenciosamente.
          const existing = await prisma.product.findUnique({
            where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: rootmodel } },
            select: { id: true, slug: true },
          });
          const needsNewSlug =
            !existing || existing.slug.startsWith(LEGACY_SLUG_PREFIX);
          const slug = needsNewSlug
            ? await resolveCleanProductSlug(cleanName, existing?.id ?? null)
            : existing.slug;

          // Proxy de imágenes ANTES del upsert. ensureMediaAsset registra
          // la URL original en MediaAsset y devuelve `/api/m/<hash>` opaco.
          // El cliente público NUNCA ve publicatalogue.com.
          const proxiedPrimary = await ensureMediaAsset(head.image || null, "product-primary");

          // Upsert Product (rootmodel = supplierRef).
          // Race-safe: si dos promesas del mismo chunk eligieron el mismo
          // slug "clean" antes de escribir, una falla con P2002. Reintentamos
          // hasta 3 veces añadiendo sufijo hash determinista (no aleatorio
          // para idempotencia entre syncs).
          async function upsertWithSlug(slugToUse: string) {
            return prisma.product.upsert({
              where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: rootmodel } },
              create: {
                supplier: SUPPLIER,
                supplierRef: rootmodel,
                slug: slugToUse,
                name: cleanName,
                shortDescription: sanitizeSupplierText(head.description),
                category: categoryId ? { connect: { id: categoryId } } : undefined,
                supplierCategoryCode: head.category || null,
                weightG: parseFloat(head.pncaja || "0") > 0
                  ? Math.round((parseFloat(head.pncaja!) * 1000) / (head.unacaja || 1))
                  : null,
                lengthMm: cmStringToMm(head.length),
                widthMm: cmStringToMm(head.width),
                heightMm: cmStringToMm(head.height),
                primaryImageUrl: proxiedPrimary,
                material: sanitizeSupplierText(head.material),
                markingTechniqueHint: sanitizeSupplierText(head.tgrabacion),
                markingSizeHint: sanitizeSupplierText(head.mgrabacion),
                tags: [],
                active: true,
                syncedAt: new Date(),
              },
              update: {
                ...(needsNewSlug ? { slug: slugToUse } : {}),
                name: cleanName,
                shortDescription: sanitizeSupplierText(head.description),
                category: categoryId ? { connect: { id: categoryId } } : undefined,
                supplierCategoryCode: head.category || null,
                weightG: parseFloat(head.pncaja || "0") > 0
                  ? Math.round((parseFloat(head.pncaja!) * 1000) / (head.unacaja || 1))
                  : null,
                lengthMm: cmStringToMm(head.length),
                widthMm: cmStringToMm(head.width),
                heightMm: cmStringToMm(head.height),
                primaryImageUrl: proxiedPrimary,
                material: sanitizeSupplierText(head.material),
                markingTechniqueHint: sanitizeSupplierText(head.tgrabacion),
                markingSizeHint: sanitizeSupplierText(head.mgrabacion),
                active: true,
                syncedAt: new Date(),
              },
            });
          }

          // Hash determinista del rootmodel para sufijo de desempate.
          function rootHash(s: string): string {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return Math.abs(h).toString(36).slice(0, 4);
          }

          let product;
          try {
            product = await upsertWithSlug(slug);
          } catch (e) {
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2002" &&
              needsNewSlug
            ) {
              // Colisión de slug — añadimos sufijo determinista
              const retrySlug = `${slug}-${rootHash(rootmodel)}`;
              try {
                product = await upsertWithSlug(retrySlug);
              } catch (e2) {
                if (
                  e2 instanceof Prisma.PrismaClientKnownRequestError &&
                  e2.code === "P2002"
                ) {
                  // 2º intento con sufijo de timestamp (extremadamente raro)
                  const lastResort = `${slug}-${rootHash(rootmodel)}-${Date.now().toString(36).slice(-3)}`;
                  product = await upsertWithSlug(lastResort);
                } else {
                  throw e2;
                }
              }
            } else {
              throw e;
            }
          }
          productsUpserted++;

          // Variantes
          for (const v of variants) {
            const dimensions = parseCifraVariantDimensions(v.model, rootmodel);
            // Proxy de imagen variant (mismo motivo que el primary)
            const proxiedVariantImg = await ensureMediaAsset(v.image || null, "product-variant");
            await prisma.productVariant.upsert({
              where: { sku: v.model },
              create: {
                product: { connect: { id: product.id } },
                sku: v.model,
                variantId: v.model,
                colorName: sanitizeSupplierText(dimensions.colorName),
                // Canonicalizamos el grupo del dict (guarda "marrón"/"lila" con
                // tilde) al vocabulario minúsculas-sin-acentos común; y si el
                // sufijo no resolvió grupo, lo derivamos del nombre. Sin esto el
                // filtro de color parte el catálogo por acentos/caja.
                colorGroup: canonicalColorGroup(dimensions.colorGroup) ?? colorGroupFromName(dimensions.colorName),
                colorHex: dimensions.colorHex,
                size: dimensions.size,
                imageUrl: proxiedVariantImg,
                stockQty: toQty(v.quantity),
                stockUpdatedAt: new Date(),
              },
              update: {
                colorName: sanitizeSupplierText(dimensions.colorName),
                // Canonicalizamos el grupo del dict (guarda "marrón"/"lila" con
                // tilde) al vocabulario minúsculas-sin-acentos común; y si el
                // sufijo no resolvió grupo, lo derivamos del nombre. Sin esto el
                // filtro de color parte el catálogo por acentos/caja.
                colorGroup: canonicalColorGroup(dimensions.colorGroup) ?? colorGroupFromName(dimensions.colorName),
                colorHex: dimensions.colorHex,
                size: dimensions.size,
                imageUrl: proxiedVariantImg,
                stockQty: toQty(v.quantity),
                stockUpdatedAt: new Date(),
              },
            });
            variantsUpserted++;
            stockUpdated++;
          }
          breaker.ok();
        } catch (e) {
          errors.push({
            ref: rootmodel,
            message: e instanceof Error ? e.message : String(e),
          });
          breaker.fail();
        }
      }),
    );
    if (breaker.tripped()) {
      const msg = `Sync ABORTADO — ${breaker.summary()}`;
      errors.push({ ref: "_circuit_breaker", message: msg });
      void notifyTelegram(`⛔ cifra-sync: ${msg}`).catch((err) =>
        console.error("[cifra-sync] notifyTelegram falló:", err instanceof Error ? err.message : err),
      );
      break;
    }
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
      // Upsert cada tier — try/catch POR TIER (patrón makito-sync): un
      // registro defectuoso no debe abortar el pricelist de los modelos
      // restantes, que quedarían con precios stale ciclo tras ciclo.
      for (const tier of pt.p_disc) {
        if (!Number.isFinite(tier.quantity) || tier.quantity < 1) continue;
        try {
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
        } catch (e) {
          errors.push({
            ref: `pricelist:${pt.model}@${tier.quantity}`,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    // A diferencia del circuit-breaker del paso 4, los fallos de pricing no
    // avisaban a nadie: quedaban solo en BD. Precios stale = dinero.
    const pricelistErrors = errors.filter((er) => er.ref.startsWith("pricelist:"));
    if (pricelistErrors.length > 0) {
      void notifyTelegram(
        `⚠️ cifra-sync: ${pricelistErrors.length} tramos de precio fallaron (ej. ${escapeTgHtml(pricelistErrors[0].ref)}) — revisa /admin/suppliers`,
      ).catch((err) =>
        console.error("[cifra-sync] notifyTelegram falló:", err instanceof Error ? err.message : err),
      );
    }
  } catch (e) {
    errors.push({
      ref: "pricelist",
      message: e instanceof Error ? e.message : String(e),
    });
    void notifyTelegram(
      `⚠️ cifra-sync: pricelist completo falló: ${escapeTgHtml((e instanceof Error ? e.message : String(e)).slice(0, 150))}`,
    ).catch((err) =>
      console.error("[cifra-sync] notifyTelegram falló:", err instanceof Error ? err.message : err),
    );
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
  // Histórico (telemetría, no rompe el sync si falla).
  await recordSupplierSyncRun({
    supplier: SUPPLIER,
    startedAt,
    finishedAt,
    ok: result.ok,
    productsFetched: products.length,
    productsUpserted,
    errorsJson: errors.length ? errors.slice(0, 100) : null,
  });

  // El catálogo cambió → refrescar el índice de búsqueda. Nunca es fatal:
  // con Meili caído, la búsqueda cae sola al fallback Prisma.
  if (meiliEnabled()) {
    try {
      await reindexAllProducts();
    } catch (e) {
      console.error("[cifra-sync] reindex Meili falló:", e instanceof Error ? e.message : e);
    }
  }
  // Aviso interno si la duración se degrada (solo en la transición).
  await checkAndAlertSupplierDegradation(SUPPLIER);

  return result;
}
