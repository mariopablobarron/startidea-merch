import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  midoceanClient,
  pickPrimaryImage,
  variantImages,
  parseUnitToMm,
  parseWeightToG,
  slugify,
  spanishTechniqueName,
  type MidoceanRawProduct,
  type MidoceanRawPrintProduct,
} from "./midocean";
import { normalizeTechniqueName } from "@/lib/marking-techniques-es";
import { extractSize } from "@/lib/variant-grouping";

export type MidoceanSyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  productsFetched: number;
  productsUpserted: number;
  variantsUpserted: number;
  positionsUpserted: number;
  stockUpdated: number;
  fromPriceRefreshed: number; // productos cuyo fromPriceCents se recalculó tras el sync de tiers
  durationMs: number;
  errors: Array<{ ref: string; message: string }>;
};

/**
 * Sync completo MidOcean: products + stock + printdata.
 * Idempotente — usa upserts. Ejecuta en transacciones por chunks
 * para no saturar Postgres.
 */
export async function runMidoceanSync(): Promise<MidoceanSyncResult> {
  const startedAt = new Date();
  const errors: MidoceanSyncResult["errors"] = [];
  let productsUpserted = 0;
  let variantsUpserted = 0;
  let positionsUpserted = 0;
  let stockUpdated = 0;

  // Crear marcador
  await prisma.supplierSync.upsert({
    where: { supplier: "midocean" },
    create: { supplier: "midocean", startedAt, ok: false },
    update: { startedAt, finishedAt: null, ok: false, productsFetched: 0, productsUpserted: 0, errorsJson: Prisma.DbNull },
  });

  // 1. fetch en paralelo
  const [products, stock, printData] = await Promise.all([
    midoceanClient.fetchProducts("es"),
    midoceanClient.fetchStock(),
    midoceanClient.fetchPrintData("es"),
  ]);

  // 2. técnicas globales
  const techniqueByCode = new Map<string, { id: string; name: string }>();
  for (const t of printData.printing_technique_descriptions) {
    const rawName = spanishTechniqueName(t);
    const name = normalizeTechniqueName(rawName);
    const upserted = await prisma.markingTechnique.upsert({
      where: { code: t.id },
      create: { code: t.id, name },
      update: { name },
    });
    techniqueByCode.set(t.id, upserted);
  }

  // 3. mapa printdata por master_code
  const printByMaster = new Map<string, MidoceanRawPrintProduct>();
  for (const p of printData.products) printByMaster.set(p.master_code, p);

  // 4. categorías (level1 → level2 → level3)
  const categoryCache = new Map<string, string>();
  async function ensureCategory(name: string, parentId: string | null, level: number): Promise<string> {
    const slug = slugify(name);
    const cacheKey = `${parentId ?? ""}/${slug}`;
    const cached = categoryCache.get(cacheKey);
    if (cached) return cached;
    const existing = await prisma.category.findFirst({ where: { slug, parentId } });
    if (existing) {
      categoryCache.set(cacheKey, existing.id);
      return existing.id;
    }
    // try/catch de carrera: dos syncs solapados pueden crear la misma categoría
    // a la vez → P2002. Re-buscamos en vez de reventar (igual que cifra/makito-sync).
    // (bug-bounty 2026-06-17)
    try {
      const created = await prisma.category.create({ data: { slug, name, parentId, level } });
      categoryCache.set(cacheKey, created.id);
      return created.id;
    } catch {
      const retry = await prisma.category.findFirst({ where: { slug, parentId } });
      if (retry) {
        categoryCache.set(cacheKey, retry.id);
        return retry.id;
      }
      throw new Error(`No se pudo crear ni encontrar la categoría ${slug}`);
    }
  }

  // 5. productos
  for (const raw of products) {
    // Skipea productos sin nombre (e.g. catálogos físicos del propio MidOcean)
    if (!raw.product_name || !raw.product_name.trim()) continue;
    try {
      await upsertProduct(raw, printByMaster.get(raw.master_code), {
        techniqueByCode,
        ensureCategory,
        onCounts: (p, v, pos) => {
          productsUpserted += p;
          variantsUpserted += v;
          positionsUpserted += pos;
        },
      });
    } catch (e) {
      errors.push({ ref: raw.master_code, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // 6. stock — bulk update por chunks
  const skuToQty = new Map<string, number>();
  for (const s of stock.stock) skuToQty.set(s.sku, s.qty);

  const stockChunks = Array.from(skuToQty.entries());
  const chunkSize = 500;
  const stockUpdatedAt = new Date(stock.modified_at);
  for (let i = 0; i < stockChunks.length; i += chunkSize) {
    const chunk = stockChunks.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map(([sku, qty]) =>
        prisma.productVariant.updateMany({
          where: { sku },
          data: { stockQty: qty, stockUpdatedAt },
        }),
      ),
    );
    stockUpdated += chunk.length;
  }

  // 7. Refresh Product.fromPriceCents desde el MIN(unitPriceCents) de sus PriceTier.
  //
  // El campo Product.fromPriceCents es denormalizado: lo usan cards de catálogo
  // y listados rápidos para mostrar "Desde X €" sin tener que JOIN a variants→tiers.
  // El sync de products de MidOcean NO trae precio (eso viene del pricelist sync
  // separado, que actualiza PriceTier). Si no recalculamos aquí, fromPriceCents
  // queda en 0 y los listings cargan vacío o caen a fallbacks (incidente detectado
  // 2026-05-24: 0/2.409 productos midocean con fromPriceCents > 0 pese a tener
  // 14.644 tiers en BD).
  //
  // Bulk update con SQL crudo — 2.409 productos en 1 query vs 2.409 queries.
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
      AND p.supplier = 'midocean'
      AND (p."fromPriceCents" IS NULL OR p."fromPriceCents" != sub.min_price)
  `;

  const finishedAt = new Date();
  const result: MidoceanSyncResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ok: errors.length === 0,
    productsFetched: products.length,
    productsUpserted,
    variantsUpserted,
    positionsUpserted,
    stockUpdated,
    fromPriceRefreshed: Number(fromPriceRefreshed),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    errors: errors.slice(0, 50),
  };

  await prisma.supplierSync.update({
    where: { supplier: "midocean" },
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

async function upsertProduct(
  raw: MidoceanRawProduct,
  printProduct: MidoceanRawPrintProduct | undefined,
  ctx: {
    techniqueByCode: Map<string, { id: string; name: string }>;
    ensureCategory: (name: string, parentId: string | null, level: number) => Promise<string>;
    onCounts: (p: number, v: number, pos: number) => void;
  },
) {
  const v0 = raw.variants?.[0];
  let categoryId: string | undefined;
  if (v0?.category_level1) {
    const l1 = await ctx.ensureCategory(v0.category_level1, null, 1);
    if (v0.category_level2) {
      const l2 = await ctx.ensureCategory(v0.category_level2, l1, 2);
      if (v0.category_level3) {
        categoryId = await ctx.ensureCategory(v0.category_level3, l2, 3);
      } else {
        categoryId = l2;
      }
    } else {
      categoryId = l1;
    }
  }

  // Slug LIMPIO sin supplier SKU (no exponer "-mo9812" al cliente).
  // Si ya existe el producto con un slug que NO contiene el master_code,
  // lo mantenemos (estable). Si no, calculamos uno nuevo con resolución
  // de colisiones y archivamos el slug antiguo como redirect 301.
  const existing = await prisma.product.findUnique({
    where: { supplier_supplierRef: { supplier: "midocean", supplierRef: raw.master_code } },
    select: { id: true, slug: true },
  });
  const masterToken = raw.master_code.toLowerCase();
  const currentSlugIsClean = existing && !existing.slug.toLowerCase().includes(masterToken);
  const slug = currentSlugIsClean
    ? existing!.slug
    : await resolveCleanProductSlug(raw.product_name, existing?.id ?? null);

  const productData = {
    supplier: "midocean" as const,
    supplierRef: raw.master_code,
    slug,
    name: raw.product_name,
    brand: raw.brand,
    shortDescription: raw.short_description,
    longDescription: raw.long_description,
    material: raw.material,
    categoryId,
    supplierCategoryCode: raw.category_code,
    weightG: parseWeightToG(raw.gross_weight, raw.gross_weight_unit),
    lengthMm: parseUnitToMm(raw.length, raw.length_unit),
    widthMm: parseUnitToMm(raw.width, raw.width_unit),
    heightMm: parseUnitToMm(raw.height, raw.height_unit),
    primaryImageUrl: pickPrimaryImage(raw.digital_assets) || pickPrimaryImage(v0?.digital_assets),
    countryOfOrigin: raw.country_of_origin,
    active: true,
    syncedAt: new Date(),
  };

  const product = await prisma.product.upsert({
    where: { supplier_supplierRef: { supplier: "midocean", supplierRef: raw.master_code } },
    create: productData,
    update: productData,
  });

  // Si el slug acaba de cambiar, archivar el viejo como redirect 301.
  // Solo si el viejo era no-limpio (contenía supplier SKU) — los renames
  // espontáneos no nos interesan.
  if (existing && existing.slug !== slug && existing.slug.toLowerCase().includes(masterToken)) {
    await prisma.productSlugRedirect
      .upsert({
        where: { oldSlug: existing.slug },
        create: { oldSlug: existing.slug, productId: product.id },
        update: { productId: product.id },
      })
      .catch(() => {});
  }

  // Asignar referencia propia Startidea (determinística desde id) si falta.
  // No se sobrescribe nunca para mantener estabilidad de URLs/refs ya conocidas.
  if (!product.internalRef) {
    const { generateInternalRef } = await import("@/lib/internal-ref");
    await prisma.product.update({
      where: { id: product.id },
      data: { internalRef: generateInternalRef(product.id) },
    });
  }

  // Proxy de imágenes: registrar primaryImageUrl en MediaAsset para que
  // el endpoint /api/m/[hash] pueda resolverla sin exponer el CDN proveedor.
  const { ensureMediaAsset } = await import("@/lib/proxy-image");
  if (productData.primaryImageUrl) {
    await ensureMediaAsset(productData.primaryImageUrl, "product-primary").catch(() => {});
  }

  // variantes
  for (const v of raw.variants ?? []) {
    const data = {
      productId: product.id,
      sku: v.sku,
      variantId: v.variant_id,
      colorName: v.color_description,
      colorGroup: v.color_group,
      // El feed de MidOcean NO trae talla: en textil va embebida en el SKU
      // (S17000-BF-3XL → 3XL). extractSize solo acepta tallas ALFABÉTICAS
      // conocidas — los sufijos numéricos (MO9268-03 = color) devuelven null.
      size: extractSize({ size: null, sku: v.sku }),
      gtin: v.gtin,
      imageUrl: pickPrimaryImage(v.digital_assets),
      images: variantImages(v.digital_assets),
    };
    await prisma.productVariant.upsert({
      where: { sku: v.sku },
      create: data,
      update: data,
    });
    if (data.imageUrl) {
      await ensureMediaAsset(data.imageUrl, "product-variant").catch(() => {});
    }
  }

  // marcaje
  if (printProduct?.printing_positions) {
    // limpiar y recrear positions de este producto (más simple que diff)
    await prisma.markingPosition.deleteMany({ where: { productId: product.id } });
    for (const pos of printProduct.printing_positions) {
      const sample = pos.images?.[0];
      const posImage = sample?.print_position_image_with_area || sample?.print_position_image_blank || null;
      const created = await prisma.markingPosition.create({
        data: {
          productId: product.id,
          positionId: pos.position_id,
          maxWidthMm: pos.max_print_size_width ?? null,
          maxHeightMm: pos.max_print_size_height ?? null,
          imageUrl: posImage,
        },
      });
      if (posImage) {
        await ensureMediaAsset(posImage, "marking-position").catch(() => {});
      }
      // técnicas asignadas a esta posición
      for (const t of pos.printing_techniques ?? []) {
        const tech = ctx.techniqueByCode.get(t.id);
        if (!tech) continue;
        await prisma.markingTechniqueOnPosition.upsert({
          where: { positionId_techniqueId: { positionId: created.id, techniqueId: tech.id } },
          create: {
            positionId: created.id,
            techniqueId: tech.id,
            isDefault: !!t.default,
            maxColors: t.max_colours ? parseInt(t.max_colours, 10) || null : null,
          },
          update: {
            isDefault: !!t.default,
            maxColors: t.max_colours ? parseInt(t.max_colours, 10) || null : null,
          },
        });
      }
      ctx.onCounts(0, 0, 1);
    }
  }

  ctx.onCounts(1, raw.variants?.length ?? 0, 0);
}

/**
 * Genera un slug limpio (sin supplier SKU) único entre productos.
 * Si colisiona con otro producto distinto, añade sufijo -2, -3, …
 * El productSelf permite reutilizar el slug propio sin contarse a sí mismo
 * como colisión.
 */
export async function resolveCleanProductSlug(
  productName: string,
  productSelfId: string | null,
): Promise<string> {
  const base = slugify(productName) || "producto";
  let candidate = base;
  let suffix = 1;
  // Hasta 50 intentos (suficiente para repeticiones reales de nombre)
  while (suffix <= 50) {
    const collision = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!collision || collision.id === productSelfId) return candidate;
    suffix++;
    candidate = `${base}-${suffix}`;
  }
  // Fallback defensivo (no debería darse en práctica)
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}
