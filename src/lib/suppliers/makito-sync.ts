/**
 * Sync completo del catálogo Makito.
 *
 * Estrategia: bulk download de XML (productos, stock, precios, técnicas
 * marcaje) + API para tarifa de marcaje JSON. 5 downloads grandes en vez
 * de ~22000 requests del API REST por producto.
 *
 * Pasos:
 *   1. SupplierSync init + reset estado
 *   2. Descargar XML productos (17 MB español)
 *   3. Parse + upsert Product + ProductVariant + categoría + imágenes proxy
 *   4. Descargar XML precios (1.1 MB) → PriceTier por variante (matnr)
 *   5. Descargar XML stock (5.5 MB) → stockQty por variante
 *   6. Descargar API markingTechniquesPrices → MarkingTechnique +
 *      MarkingPriceScale globales (142 técnicas)
 *   7. Refresh Product.fromPriceCents = MIN(unitPriceCents) por producto
 *   8. SupplierSync finish con stats
 */

import { createSyncBreaker } from "@/lib/sync-circuit-breaker";
import { notifyTelegram } from "@/lib/telegram";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { recordSupplierSyncRun } from "./sync-history";
import { Prisma } from "@prisma/client";
import {
  fetchProductsXml,
  fetchPricesXml,
  fetchStockXml,
  fetchMarkingTechniquesPrices,
  type MakitoMarkingTechniquePrice,
} from "./makito";
import { resolveCleanProductSlug } from "./midocean-sync";
import { ensureMediaAsset } from "@/lib/proxy-image";
import { colorGroupFromName } from "@/lib/variant-grouping";

const SUPPLIER = "makito" as const;
const CHUNK = 25; // productos por batch (Makito tiene 4482, son ~180 chunks)

export type MakitoSyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  productsFetched: number;
  productsUpserted: number;
  variantsUpserted: number;
  tiersUpserted: number;
  stockUpdated: number;
  techniquesUpserted: number;
  scalesUpserted: number;
  fromPriceRefreshed: number;
  durationMs: number;
  errors: Array<{ ref: string; message: string }>;
};

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

function cmToMm(v: unknown): number | null {
  const n = toNum(v);
  if (n === null || n <= 0) return null;
  // Makito viene en cm como números — algunos productos en mm. Heurística: si >100 ya es mm.
  return n < 200 ? Math.round(n * 10) : Math.round(n);
}

function priceToCents(v: unknown): number {
  const n = toNum(v);
  if (n === null) return 0;
  return Math.round(n * 100);
}

// ─── Parsing XML ──────────────────────────────────────────────────────────

type XmlProduct = {
  ref: string | number;
  name?: string;
  type?: string;
  composition?: string;
  otherinfo?: string;
  extendedinfo?: string;
  brand?: string;
  printcode?: string;
  item_long?: number | string;
  item_hight?: number | string;
  item_width?: number | string;
  item_diameter?: number | string;
  item_weight?: number | string;
  imagemain?: string;
  keywords?: string;
  categories?: {
    category_ref_1?: string;
    category_name_1?: string;
    category_ref_2?: string;
    category_name_2?: string;
  };
  variants?: {
    variant?: XmlVariant | XmlVariant[];
  };
};

type XmlVariant = {
  matnr: string | number;
  refct?: string;
  colour?: string;
  colftp?: string;
  colourname?: string;
  size?: string;
  image500pxlogo?: string;
  image500px?: string;
  imagemain?: string;
};

function parseXmlProducts(xml: string): XmlProduct[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
  const data = parser.parse(xml) as { catalog?: { product?: XmlProduct | XmlProduct[] } };
  const products = data?.catalog?.product;
  if (!products) return [];
  return Array.isArray(products) ? products : [products];
}

// El XML real de Makito usa CAMELCASE sin underscore: section1, price1.
// Confirmado con HEAD + sample en sandbox 2026-05-26.
type XmlPrice = {
  ref: string | number;
  section1?: number | string;
  price1?: number;
  section2?: number | string;
  price2?: number;
  section3?: number | string;
  price3?: number;
  section4?: number | string;
  price4?: number;
  section5?: number | string;
  price5?: number;
  section6?: number | string;
  price6?: number;
};

function parseXmlPrices(xml: string): XmlPrice[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
  const data = parser.parse(xml) as { catalog?: { product?: XmlPrice | XmlPrice[] } };
  const items = data?.catalog?.product;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

type XmlStock = {
  matnr?: string | number;
  ref?: string | number;
  stock?: number | string;
  available?: string;
  colour?: string;
  size?: string;
};

function parseXmlStock(xml: string): XmlStock[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
  const data = parser.parse(xml) as { catalog?: { product?: XmlStock | XmlStock[] } };
  const items = data?.catalog?.product;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// ─── Main sync ────────────────────────────────────────────────────────────

export async function runMakitoSync(): Promise<MakitoSyncResult> {
  const startedAt = new Date();
  const errors: MakitoSyncResult["errors"] = [];
  let productsUpserted = 0;
  let variantsUpserted = 0;
  let tiersUpserted = 0;
  let stockUpdated = 0;
  let techniquesUpserted = 0;
  let scalesUpserted = 0;

  // 1. SupplierSync init
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

  // 2. Descargar + parsear XML productos
  let products: XmlProduct[] = [];
  try {
    const xml = await fetchProductsXml("esp");
    products = parseXmlProducts(xml);
  } catch (e) {
    errors.push({ ref: "_xml", message: e instanceof Error ? e.message : String(e) });
  }

  // 3. Upsert productos + variantes
  // Cache de categorías root (parentId=null) — mismo patrón que cifra-sync
  const categoryCache = new Map<string, string>();
  async function resolveCategory(name: string): Promise<string | null> {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const slug = safeSlug(trimmed);
    if (!slug) return null;
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
    } catch {
      // race: re-read
      const again = await prisma.category.findFirst({
        where: { parentId: null, slug },
        select: { id: true },
      });
      if (again) {
        categoryCache.set(slug, again.id);
        return again.id;
      }
      return null;
    }
  }

  // Hash determinista para retry-on-collision (ya probado en cifra-sync)
  function rootHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 4);
  }

  const breaker = createSyncBreaker();
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (p) => {
        const ref = String(p.ref);
        if (!ref || !p.name) return;
        try {
          // Categoría primaria (level 1)
          const categoryId = await resolveCategory(
            String(p.categories?.category_name_1 || ""),
          );

          // Imagen primaria proxy
          const primaryImageUrl = await ensureMediaAsset(
            String(p.imagemain || "").trim() || null,
            "product-primary",
          );

          // Slug: lookup existing, generar limpio si nuevo o si legacy
          const existing = await prisma.product.findUnique({
            where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: ref } },
            select: { id: true, slug: true },
          });
          const needsNewSlug =
            !existing || existing.slug.startsWith("mak-") || existing.slug.startsWith("mk-");
          const slug = needsNewSlug
            ? await resolveCleanProductSlug(String(p.name).trim(), existing?.id ?? null)
            : existing.slug;

          // Upsert con retry-on-collision
          async function upsertWithSlug(slugToUse: string) {
            return prisma.product.upsert({
              where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: ref } },
              create: {
                supplier: SUPPLIER,
                supplierRef: ref,
                slug: slugToUse,
                name: String(p.name).trim(),
                shortDescription: String(p.extendedinfo || p.otherinfo || "").trim() || null,
                category: categoryId ? { connect: { id: categoryId } } : undefined,
                supplierCategoryCode: String(p.categories?.category_ref_1 || "") || null,
                weightG: toNum(p.item_weight) || null,
                lengthMm: cmToMm(p.item_long),
                widthMm: cmToMm(p.item_width),
                heightMm: cmToMm(p.item_hight),
                primaryImageUrl,
                material: String(p.composition || "").trim() || null,
                brand: String(p.brand || "").trim() || null,
                markingTechniqueHint: String(p.printcode || "").trim() || null,
                tags: [],
                active: true,
                syncedAt: new Date(),
              },
              update: {
                ...(needsNewSlug ? { slug: slugToUse } : {}),
                name: String(p.name).trim(),
                shortDescription: String(p.extendedinfo || p.otherinfo || "").trim() || null,
                category: categoryId ? { connect: { id: categoryId } } : undefined,
                supplierCategoryCode: String(p.categories?.category_ref_1 || "") || null,
                weightG: toNum(p.item_weight) || null,
                lengthMm: cmToMm(p.item_long),
                widthMm: cmToMm(p.item_width),
                heightMm: cmToMm(p.item_hight),
                primaryImageUrl,
                material: String(p.composition || "").trim() || null,
                brand: String(p.brand || "").trim() || null,
                markingTechniqueHint: String(p.printcode || "").trim() || null,
                active: true,
                syncedAt: new Date(),
              },
            });
          }

          let product;
          try {
            product = await upsertWithSlug(slug);
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && needsNewSlug) {
              const retrySlug = `${slug}-${rootHash(ref)}`;
              try {
                product = await upsertWithSlug(retrySlug);
              } catch (e2) {
                if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === "P2002") {
                  product = await upsertWithSlug(`${slug}-${rootHash(ref)}-${Date.now().toString(36).slice(-3)}`);
                } else throw e2;
              }
            } else throw e;
          }
          productsUpserted++;

          // Variantes
          const rawVariants = p.variants?.variant;
          const variantList = !rawVariants ? [] : Array.isArray(rawVariants) ? rawVariants : [rawVariants];
          for (const v of variantList) {
            const matnr = String(v.matnr);
            if (!matnr || matnr === "0") continue;
            const variantImg = await ensureMediaAsset(
              String(v.image500px || v.image500pxlogo || "").trim() || null,
              "product-variant",
            );
            await prisma.productVariant.upsert({
              where: { sku: matnr },
              create: {
                product: { connect: { id: product.id } },
                sku: matnr,
                variantId: matnr,
                colorName: String(v.colourname || v.colour || "").trim() || null,
                // El feed Makito NO trae grupo de color → lo derivamos del nombre
                // para que el producto entre en el filtro de color del catálogo.
                colorGroup: colorGroupFromName(String(v.colourname || v.colour || "")),
                colorHex: null,
                size: String(v.size || "").trim() || null,
                imageUrl: variantImg,
                stockQty: 0,
                stockUpdatedAt: new Date(),
              },
              update: {
                colorName: String(v.colourname || v.colour || "").trim() || null,
                colorGroup: colorGroupFromName(String(v.colourname || v.colour || "")),
                size: String(v.size || "").trim() || null,
                imageUrl: variantImg,
              },
            });
            variantsUpserted++;
          }
          breaker.ok();
        } catch (e) {
          errors.push({
            ref,
            message: e instanceof Error ? e.message : String(e),
          });
          breaker.fail();
        }
      }),
    );
    if (breaker.tripped()) {
      const msg = `Sync ABORTADO — ${breaker.summary()}`;
      errors.push({ ref: "_circuit_breaker", message: msg });
      void notifyTelegram(`⛔ makito-sync: ${msg}`).catch((err) =>
        console.error("[makito-sync] notifyTelegram falló:", err instanceof Error ? err.message : err),
      );
      break;
    }
  }

  // 4. Precios productos · XML
  try {
    const xml = await fetchPricesXml();
    const tarifs = parseXmlPrices(xml);
    // Mapeo ref → primer variant.id (Makito tiene tarifa por producto, no por variante;
    // aplicamos los tiers a todas las variantes del producto)
    const productRefs = Array.from(new Set(tarifs.map((t) => String(t.ref))));
    const variantsByRef = new Map<string, string[]>();
    if (productRefs.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: {
          product: { supplier: SUPPLIER, supplierRef: { in: productRefs } },
        },
        select: { id: true, product: { select: { supplierRef: true } } },
      });
      for (const v of variants) {
        const r = v.product.supplierRef;
        if (!variantsByRef.has(r)) variantsByRef.set(r, []);
        variantsByRef.get(r)!.push(v.id);
      }
    }

    for (const t of tarifs) {
      const variantIds = variantsByRef.get(String(t.ref)) || [];
      if (variantIds.length === 0) continue;
      const tiers: Array<{ minQty: number; cents: number }> = [];
      for (let i = 1; i <= 6; i++) {
        // Makito XML usa camelCase sin underscore: section1, price1, etc.
        // Además section1 puede venir como "-500" (negativo = "hasta 500" pero
        // lo guardamos como minQty=1 para que el tier cubra desde 1 unidad).
        const rawSec = (t as unknown as Record<string, number | string>)[`section${i}`];
        const price = (t as unknown as Record<string, number>)[`price${i}`];
        // El primer tramo llega NEGATIVO ("-500" = "hasta 500") y lo guardamos
        // como minQty=1 para que cubra desde 1 unidad. El parser XML puede
        // entregarlo como number o string, con o sin espacios: normalizamos a
        // string trimmeado antes de decidir (un `-500` con espacio inicial
        // volvería a descartarse si solo miráramos startsWith sin trim). Antes,
        // el caso number negativo caía en `sec > 0` y DESCARTABA el tramo:
        // 4.452 productos cotizaban SIEMPRE al precio de 500+ uds (auditoría
        // 2026-07-04).
        const secStr = String(rawSec ?? "").trim();
        let sec: number;
        if (secStr.startsWith("-")) {
          sec = 1; // primer tramo ("hasta N", cualquier negativo)
        } else {
          const n = parseInt(secStr, 10);
          sec = Number.isFinite(n) ? n : 0;
        }
        if (sec > 0 && price > 0) {
          tiers.push({ minQty: sec, cents: priceToCents(price) });
        }
      }
      if (tiers.length === 0) continue;
      // Upsert tiers en cada variant del producto
      for (const variantId of variantIds) {
        for (const tier of tiers) {
          await prisma.priceTier
            .upsert({
              where: { variantId_minQty: { variantId, minQty: tier.minQty } },
              create: {
                variantId,
                minQty: tier.minQty,
                unitPriceCents: tier.cents,
                source: "MAKITO_PRICELIST",
              },
              update: {
                unitPriceCents: tier.cents,
                source: "MAKITO_PRICELIST",
              },
            })
            .catch(() => {});
          tiersUpserted++;
        }
      }
    }
  } catch (e) {
    errors.push({ ref: "_prices", message: e instanceof Error ? e.message : String(e) });
  }

  // 5. Stock · XML
  try {
    const xml = await fetchStockXml();
    const stocks = parseXmlStock(xml);
    // Update stockQty por matnr
    for (let i = 0; i < stocks.length; i += 100) {
      const chunkStocks = stocks.slice(i, i + 100);
      await Promise.all(
        chunkStocks.map(async (s) => {
          if (!s.matnr) return;
          const qty = toNum(s.stock) || 0;
          await prisma.productVariant
            .update({
              where: { sku: String(s.matnr) },
              data: { stockQty: Math.max(0, Math.round(qty)), stockUpdatedAt: new Date() },
            })
            .catch(() => {});
          stockUpdated++;
        }),
      );
    }
  } catch (e) {
    errors.push({ ref: "_stock", message: e instanceof Error ? e.message : String(e) });
  }

  // 6. Tarifa de marcaje (API JSON · 142 técnicas con 10 tramos)
  try {
    const resp = await fetchMarkingTechniquesPrices();
    const techs = resp.techniques || [];
    for (const t of techs) {
      // Saltamos técnicas malformadas (code null/vacío) sin contarlas como error
      // ni romper el bucle: la API de Makito devuelve algún registro corrupto.
      const rawCode = (t.code ?? "").toString().trim();
      if (!rawCode || rawCode.toLowerCase() === "null") continue;
      // try/catch por iteración: un registro defectuoso no debe abortar el resto
      // de técnicas (antes el throw tumbaba el bucle entero → ok=false + pérdida).
      try {
        await upsertMarkingTechnique(t);
        techniquesUpserted++;
        scalesUpserted += await upsertMarkingScales(t);
      } catch (e) {
        errors.push({
          ref: `_marking:${rawCode}`,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } catch (e) {
    errors.push({ ref: "_marking", message: e instanceof Error ? e.message : String(e) });
  }

  // 7. Refresh Product.fromPriceCents = MIN(unitPriceCents) — mismo patrón que cifra
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
      AND p.supplier = 'makito'
      AND (p."fromPriceCents" IS NULL OR p."fromPriceCents" != sub.min_price)
  `;

  // 8. SupplierSync finish
  const finishedAt = new Date();
  const result: MakitoSyncResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ok: errors.length === 0,
    productsFetched: products.length,
    productsUpserted,
    variantsUpserted,
    tiersUpserted,
    stockUpdated,
    techniquesUpserted,
    scalesUpserted,
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
  return result;
}

// ─── Upsert helpers de marcaje (MarkingTechnique + MarkingPriceScale) ──────

async function upsertMarkingTechnique(t: MakitoMarkingTechniquePrice): Promise<void> {
  // Guard: la API de Makito a veces devuelve técnicas malformadas con code null
  // (ej. ref 100121). Sin code no hay clave única posible ni nombre legible →
  // las saltamos en silencio en vez de reventar el upsert (name NOT NULL).
  const rawCode = (t.code ?? "").toString().trim();
  if (!rawCode || rawCode.toLowerCase() === "null") return;
  // Mapeo code → nombre legible (mismo que ya tenemos en SupplierMarkingRule)
  // Si el code matchea con uno conocido, reutilizamos label. Si no, code crudo.
  const labelMap: Record<string, string> = {
    A: "Tampografía A",
    B: "Tampografía B",
    C: "Tampografía C",
    D: "Tampografía D",
    E: "Serigrafía E",
    F: "Serigrafía F",
    G: "Serigrafía G",
    L: "Láser",
    LL: "Láser",
    LCO1: "Láser CO2",
    LCO2: "Láser CO2",
    T: "Termograbado",
    TC: "Termograbado",
    DTF: "DTF",
    BORDADO: "Bordado",
    DIGITAL: "Impresión digital",
    SUB1: "Sublimación",
    SUB2: "Sublimación",
  };
  const name = labelMap[rawCode] || rawCode;
  // El código del MarkingTechnique debe ser único globalmente. Para evitar
  // colisiones con MidOcean (que usa códigos cortos como "B", "L3"...) y Cifra
  // (que comparte códigos como "A", "F" en SupplierMarkingRule), prefijamos
  // las MarkingTechnique de Makito con "MK_" para mantenerlas separadas.
  const techniqueCode = `MK_${rawCode}`;
  await prisma.markingTechnique.upsert({
    where: { code: techniqueCode },
    create: {
      code: techniqueCode,
      name,
      description: `Makito ${t.code} · ref ${t.technique_ref}`,
      pricingType: "NumberOfPositions",
      setupCents: t.cliche ? Math.round(t.cliche * 100) : null,
      setupRepeatCents: t.cliche_repetition ? Math.round(t.cliche_repetition * 100) : null,
      hasNextColour: (t.price_col_1 || 0) > 0,
    },
    update: {
      name,
      description: `Makito ${t.code} · ref ${t.technique_ref}`,
      setupCents: t.cliche ? Math.round(t.cliche * 100) : null,
      setupRepeatCents: t.cliche_repetition ? Math.round(t.cliche_repetition * 100) : null,
      hasNextColour: (t.price_col_1 || 0) > 0,
    },
  });
}

async function upsertMarkingScales(t: MakitoMarkingTechniquePrice): Promise<number> {
  // Las técnicas Makito viven en DOS juegos de códigos (incidente 2026-06-15):
  // "MK_F" (tarifa histórica) y "MK_F_100316" (las que crea el enrich y a las
  // que apuntan las POSICIONES de los productos — DTF: 2.049 posiciones).
  // Las scales deben aterrizar en TODOS los códigos existentes, o la ficha
  // busca la tarifa en el código con sufijo y encuentra 0 (marcaje a 0 €).
  const candidates = [`MK_${t.code}`, `MK_${t.code}_${t.technique_ref}`];
  const targets = (
    await prisma.markingTechnique.findMany({
      where: { code: { in: candidates } },
      select: { code: true },
    })
  ).map((x) => x.code);
  let count = 0;
  for (const techniqueCode of targets) {
    // 10 tramos posibles, la mayoría sólo usa 5
    for (let i = 1; i <= 10; i++) {
      const rawSec = (t as unknown as Record<string, number>)[`section_${i}`];
      const price = (t as unknown as Record<string, number>)[`price_${i}`];
      const priceCol = (t as unknown as Record<string, number>)[`price_col_${i}`];
      const priceCm = (t as unknown as Record<string, number>)[`price_cm_${i}`];
      // Primer tramo negativo = "hasta N" → minQty 1 (misma convención que los
      // PriceTier de producto; antes se descartaba y se perdía el tramo pequeño).
      const sec = rawSec && rawSec < 0 ? 1 : rawSec;
      if (!sec || sec <= 0) continue;
      // DTF y familia tarifan POR CM² (price_cm_i); el resto por unidad
      // (price_i). Antes solo se leía price_i → las 3 técnicas DTF quedaban
      // SIN tarifa y ~900 productos cotizaban el marcaje a 0 €. Unidades:
      // price_cm llega en € con 4 decimales (0,0034 €/cm²) → en céntimos
      // enteros redondea a 0; se guarda ×10.000 (centésimas de céntimo).
      const perCm2 = (!price || price <= 0) && priceCm != null && priceCm > 0;
      const unitCostCents = perCm2
        ? Math.round(priceCm * 10000)
        : Math.round((price ?? 0) * 100);
      if (unitCostCents <= 0) continue;
      const minUnitCents =
        perCm2 && t.min_unit && t.min_unit > 0 ? Math.round(t.min_unit * 100) : null;
      // Prisma 6 rechaza rangeId=null en compound unique. Mismo bug que ya
      // arreglamos en cifra-sync para Category. Usamos findFirst + create.
      const existing = await prisma.markingPriceScale.findFirst({
        where: { techniqueCode, rangeId: null, minQty: sec },
        select: { id: true },
      });
      try {
        if (existing) {
          await prisma.markingPriceScale.update({
            where: { id: existing.id },
            data: {
              unitCostCents,
              perCm2,
              minUnitCents,
              nextColourCostCents: priceCol ? Math.round(priceCol * 100) : null,
            },
          });
        } else {
          await prisma.markingPriceScale.create({
            data: {
              techniqueCode,
              rangeId: null,
              areaFromCm2: null,
              areaToCm2: null,
              minQty: sec,
              unitCostCents,
              perCm2,
              minUnitCents,
              nextColourCostCents: priceCol ? Math.round(priceCol * 100) : null,
            },
          });
        }
        count++;
      } catch {
        // race condition entre llamadas paralelas — silent
      }
    }
  }
  return count;
}
