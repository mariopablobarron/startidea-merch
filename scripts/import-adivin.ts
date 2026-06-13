#!/usr/bin/env bun
/**
 * Importador del catálogo ADIVIN (banderas, fly banners, displays, carpas…).
 *
 * Adivin NO tiene API: el catálogo se capturó del sitio público (robots-compliant)
 * y se enriqueció con el PDF oficial. Datos versionados en src/data/adivin-seed.json.
 * Los PRECIOS son de distribuidor (ocultos) → se aportan aparte en un CSV de tarifa.
 *
 * Qué hace:
 *   1. Lee src/data/adivin-seed.json (63 productos: nombre, ref, categoría,
 *      material, descripción, imágenes adivin.com).
 *   2. Cruza precios desde un CSV de tarifa (--prices ruta.csv) por referencia.
 *      Columnas aceptadas (cabecera flexible): ref / ref_adivin, pvp / PVP_sin_IVA
 *      (euros con coma o punto). Sin precio → producto se crea INACTIVO.
 *   3. Resuelve/crea la categoría raíz.
 *   4. Proxea cada imagen con ensureMediaAsset → /api/m/<hash> (NUNCA expone
 *      adivin.com al cliente; el host ya está en proxy-image PROVIDER_HOSTS).
 *   5. Upsert Product por (supplier='adivin', supplierRef). Genera internalRef
 *      STM-XXXXXX determinista. active = (tiene precio).
 *
 * Seguridad de marca: supplierRef se guarda SOLO en BD (uso interno). El cliente
 * ve internalRef STM-XXX. Nunca se menciona "Adivin" en campos públicos.
 *
 * Uso:
 *   bun scripts/import-adivin.ts                 # DRY-RUN (no escribe)
 *   bun scripts/import-adivin.ts --commit        # escribe en BD
 *   bun scripts/import-adivin.ts --commit --prices ~/Desktop/adivin-MAESTRO-import.csv
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { ensureMediaAsset } from "@/lib/proxy-image";
import { slugify } from "@/lib/suppliers/midocean";
import { generateInternalRef } from "@/lib/internal-ref";

const SUPPLIER = "adivin" as const;
const COMMIT = process.argv.includes("--commit");
const pricesIdx = process.argv.indexOf("--prices");
const PRICES_CSV = pricesIdx >= 0 ? process.argv[pricesIdx + 1] : null;

type SeedItem = {
  supplierRef: string;
  name: string;
  category: string;
  material: string | null;
  sizes: string | null;
  shortDescription: string | null;
  images: string[];
  sourceUrl: string;
};

function log(m: string) {
  console.log(m);
}

/** Parser CSV mínimo (comillas + comas). Devuelve filas como objetos por cabecera. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/**
 * Convierte un precio en texto a céntimos, robusto a formato ES y EN.
 * "12,50 €"→1250 · "12.50"→1250 · "1.234,56"→123456 · "1,234.56"→123456
 * "1.234"→123400 (punto = miles, 3 decimales y 1 separador) · ""→null
 * Regla: el ÚLTIMO separador es el decimal, salvo que sean 3 dígitos con un
 * único separador (separador de miles). Crítico: errar aquí multiplica precios.
 */
function eurToCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = String(raw).replace(/[^\d.,]/g, "");
  if (!clean) return null;
  const decPos = Math.max(clean.lastIndexOf(","), clean.lastIndexOf("."));
  let value: number;
  if (decPos === -1) {
    value = parseFloat(clean);
  } else {
    const decimals = clean.length - decPos - 1;
    const sepCount = (clean.match(/[.,]/g) || []).length;
    if (decimals === 3 && sepCount === 1) {
      value = parseFloat(clean.replace(/[.,]/g, "")); // separador de miles, sin decimales
    } else {
      const int = clean.slice(0, decPos).replace(/[.,]/g, "");
      const frac = clean.slice(decPos + 1);
      value = parseFloat(`${int}.${frac}`);
    }
  }
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function loadPrices(): Map<string, number> {
  const map = new Map<string, number>();
  if (!PRICES_CSV) return map;
  const rows = parseCsv(readFileSync(PRICES_CSV, "utf8"));
  for (const r of rows) {
    const ref = (r["ref_adivin"] || r["ref"] || r["referencia"] || "").trim();
    const cents = eurToCents(r["pvp_sin_iva"] || r["pvp"] || r["pvp_sugerido"] || r["pvp_sugerido_sin_iva"]);
    if (ref && cents) map.set(ref, cents);
  }
  return map;
}

const categoryCache = new Map<string, string>();
async function resolveRootCategory(name: string): Promise<string | null> {
  const slug = slugify(name);
  if (!slug) return null;
  if (categoryCache.has(slug)) return categoryCache.get(slug)!;
  const existing = await prisma.category.findFirst({ where: { slug, parentId: null }, select: { id: true } });
  if (existing) { categoryCache.set(slug, existing.id); return existing.id; }
  if (!COMMIT) { categoryCache.set(slug, `dry-${slug}`); return `dry-${slug}`; }
  const created = await prisma.category.create({ data: { slug, name } });
  categoryCache.set(slug, created.id);
  return created.id;
}

const usedSlugs = new Set<string>();
async function uniqueSlug(name: string, ref: string): Promise<string> {
  let base = slugify(name) || `adivin-${slugify(ref)}`;
  let slug = base;
  let n = 1;
  while (usedSlugs.has(slug) || (await prisma.product.findUnique({ where: { slug }, select: { id: true } }).then((p) => p && p.supplierRef !== ref).catch(() => false))) {
    slug = `${base}-${++n}`;
  }
  usedSlugs.add(slug);
  return slug;
}

async function main() {
  const seed: SeedItem[] = JSON.parse(readFileSync("src/data/adivin-seed.json", "utf8"));
  const prices = loadPrices();
  log(`ADIVIN import · ${COMMIT ? "COMMIT" : "DRY-RUN"} · ${seed.length} productos · ${prices.size} precios cargados${PRICES_CSV ? ` (${PRICES_CSV})` : " (sin CSV)"}`);

  let created = 0, updated = 0, withPrice = 0, inactive = 0;
  // dedup por supplierRef (el seed tenía algún duplicado de variante)
  const bySref = new Map<string, SeedItem>();
  for (const it of seed) if (!bySref.has(it.supplierRef)) bySref.set(it.supplierRef, it);

  for (const it of bySref.values()) {
    const cents = prices.get(it.supplierRef) ?? null;
    if (cents) withPrice++; else inactive++;
    const desc = [it.shortDescription, it.sizes ? `Medidas: ${it.sizes}` : null].filter(Boolean).join(" · ").slice(0, 600) || null;

    if (!COMMIT) {
      log(`  [dry] ${it.supplierRef.padEnd(8)} ${it.name.slice(0, 42).padEnd(42)} ${cents ? (cents / 100).toFixed(2) + "€ ✓" : "sin precio (inactivo)"}`);
      continue;
    }

    const categoryId = await resolveRootCategory(it.category);
    const proxiedPrimary = await ensureMediaAsset(it.images[0] || null, "product-primary");
    const slug = await uniqueSlug(it.name, it.supplierRef);

    const existing = await prisma.product.findUnique({
      where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: it.supplierRef } },
      select: { id: true, slug: true },
    });

    const data = {
      name: it.name.trim(),
      shortDescription: desc,
      material: it.material,
      category: categoryId && !categoryId.startsWith("dry-") ? { connect: { id: categoryId } } : undefined,
      supplierCategoryCode: it.category,
      primaryImageUrl: proxiedPrimary,
      fromPriceCents: cents,
      active: cents != null,
      syncedAt: new Date(),
    };

    const product = await prisma.product.upsert({
      where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: it.supplierRef } },
      create: { supplier: SUPPLIER, supplierRef: it.supplierRef, slug: existing?.slug ?? slug, tags: [], ...data },
      update: data,
      select: { id: true, internalRef: true },
    });
    if (existing) updated++; else created++;

    // internalRef determinista (STM-XXXXXX) si aún no tiene
    if (!product.internalRef) {
      await prisma.product.update({
        where: { id: product.id },
        data: { internalRef: generateInternalRef(product.id) },
      }).catch(() => {});
    }
  }

  log(`\nRESULTADO: ${created} creados · ${updated} actualizados · ${withPrice} con precio (activos) · ${inactive} sin precio (inactivos)`);
  if (!COMMIT) log("DRY-RUN: no se ha escrito nada. Añade --commit para aplicar.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
