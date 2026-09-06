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
import { detectarFamiliasSinPack } from "@/lib/suppliers/adivin-pack-gaps";
import {
  sanitizeSupplierText,
  sanitizeSupplierName,
  assertNoSupplierJargon,
  supplierJargonHits,
} from "@/lib/suppliers/sanitize-supplier-text";

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
  /**
   * La descripción escrita por nosotros. Manda sobre `shortDescription`, que
   * es la del catálogo de origen y está redactada para un distribuidor, no
   * para el cliente. Se conserva aquella solo como rastro de la captura.
   */
  descripcion: string | null;
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

  let created = 0, updated = 0, withPrice = 0, inactive = 0, saneados = 0;

  // El upsert va por (supplier, supplierRef): dos filas con la misma referencia
  // son un solo producto. Se queda la primera — pero callarse el resto es lo
  // que hacía que dos artículos del catálogo no llegaran nunca a la tienda sin
  // que nadie se enterara. Se separan los dos casos:
  //
  //   · misma ref y mismo nombre → fila repetida en la captura, sobra y ya.
  //   · misma ref y OTRO nombre  → dos artículos distintos compartiendo
  //     referencia. Uno se queda fuera. Pasó con «Base Deluxe con ruedas» y
  //     con «Estructura Cubo Publicitario», que llevaban el número corto del
  //     catálogo de origen en vez del suyo. No se inventa una: la referencia
  //     es la que se usa para PEDIR la pieza, así que una inventada haría
  //     llegar la equivocada. La buena suele estar ya capturada en
  //     src/data/adivin-import-data.json, que trae las 60 sin repetir.
  const bySref = new Map<string, SeedItem>();
  const repetidos: SeedItem[] = [];
  const colisiones: { ref: string; entra: string; fuera: string }[] = [];
  for (const it of seed) {
    const yaEsta = bySref.get(it.supplierRef);
    if (!yaEsta) { bySref.set(it.supplierRef, it); continue; }
    if (yaEsta.name === it.name) repetidos.push(it);
    else colisiones.push({ ref: it.supplierRef, entra: yaEsta.name, fuera: it.name });
  }
  if (repetidos.length) {
    log(`\n  ${repetidos.length} fila(s) repetida(s) en la captura, ignoradas.`);
  }
  if (colisiones.length) {
    log(`\n⚠️  ${colisiones.length} producto(s) NO se importan: comparten referencia con otro.`);
    for (const c of colisiones) {
      log(`     ref ${c.ref} → entra «${c.entra}», se queda fuera «${c.fuera}»`);
    }
    log(`     Su referencia propia suele estar en src/data/adivin-import-data.json.`);
  }

  for (const it of bySref.values()) {
    const cents = prices.get(it.supplierRef) ?? null;
    if (cents) withPrice++; else inactive++;
    // La descripción de origen se SANEA; la nuestra, NO.
    //
    // El saneador está hecho para borrar el argumentario de un catálogo
    // mayorista, y borrando no distingue: «margen» le vale para 【30% de
    // margen】 y para «un margen de 5 cm en el borde»; «envío gratis» y
    // «envío incluido en el pack» comparten arranque. Sobre el texto del
    // proveedor eso es aceptable —lo que se pierde no queríamos publicarlo—,
    // pero sobre una frase escrita por nosotros deja cosas como
    //
    //     «Se entrega en 48 h de uso continuo.» → «Se de uso continuo.»
    //
    // en la ficha, sin avisar a nadie. Así que a lo nuestro se le aplica el
    // mismo criterio, pero al revés: se COMPRUEBA y el import PARA si algo
    // huele a catálogo de origen (assertNoSupplierJargon, más abajo). Nunca
    // se reescribe en silencio una frase que hemos escrito a propósito.
    //
    // Y cuando la descripción es nuestra no se le pega detrás el «Medidas: …»:
    // las medidas que importan ya están dentro de la frase, puestas donde se
    // leen. Pegarlas otra vez dejaba fichas diciendo el dato dos veces.
    const propia = it.descripcion?.slice(0, 600) || null;
    const deOrigen = [it.shortDescription, it.sizes ? `Medidas: ${it.sizes}` : null]
      .filter(Boolean).join(" · ").slice(0, 600) || null;

    // El catálogo de origen es MAYORISTA: sus descripciones dicen
    // «Exclusivamente para Rotulistas y Distribuidores【30% de margen】», es
    // decir, que el producto no es para el cliente final y cuánto ganamos
    // revendiéndolo. Se sanea al importar (limpiar la BD no basta: el
    // siguiente import lo reescribe) y se comprueba el resultado: si algo
    // sobrevive, el import PARA en vez de publicarlo.
    const desc = propia ?? sanitizeSupplierText(deOrigen);
    const material = sanitizeSupplierText(it.material);
    const name = sanitizeSupplierName(it.name);
    if (!propia && deOrigen && desc !== deOrigen) saneados++;
    if (propia) {
      // Nuestra prosa se comprueba, no se reescribe. El aviso genérico dice
      // «añade el patrón», que es el consejo correcto cuando el texto viene
      // del proveedor y el equivocado cuando lo hemos escrito nosotros: los
      // filtros son deliberadamente amplios y «un margen de 5 cm» o «envío
      // incluido» dan positivo siendo frases legítimas. Aquí lo que toca es
      // reescribir la frase, y eso es lo que hay que leer al toparse con esto.
      const hits = supplierJargonHits(propia);
      if (hits.length) {
        throw new Error(
          `La descripción de ${it.supplierRef} · ${it.name} contiene ` +
            `${hits.map((h) => `«${h}»`).join(", ")}, que el filtro de texto de ` +
            `proveedor da por jerga de mayorista. Si de verdad lo es, quítalo. Si ` +
            `es una frase legítima que se le parece, reescríbela: el filtro es ` +
            `ancho a propósito y no se va a estrechar por una ficha.`,
        );
      }
    } else {
      assertNoSupplierJargon(desc, `${it.supplierRef} · shortDescription`);
    }
    assertNoSupplierJargon(material, `${it.supplierRef} · material`);
    assertNoSupplierJargon(name, `${it.supplierRef} · name`);

    if (!COMMIT) {
      log(`  [dry] ${it.supplierRef.padEnd(8)} ${name.slice(0, 42).padEnd(42)} ${cents ? (cents / 100).toFixed(2) + "€ ✓" : "sin precio (inactivo)"}`);
      continue;
    }

    const categoryId = await resolveRootCategory(it.category);
    const proxiedPrimary = await ensureMediaAsset(it.images[0] || null, "product-primary");
    const slug = await uniqueSlug(name, it.supplierRef);

    const existing = await prisma.product.findUnique({
      where: { supplier_supplierRef: { supplier: SUPPLIER, supplierRef: it.supplierRef } },
      select: { id: true, slug: true },
    });

    // El saneador se llama aquí otra vez, en el punto de escritura, y no se
    // reutilizan `name`/`desc`/`material` de arriba: es la forma que tienen
    // los otros tres syncs y la que el guard estático sabe leer. Escribir el
    // valor ya limpio en una variable haría invisible el saneo.
    const data = {
      name: sanitizeSupplierName(it.name),
      // La nuestra entra tal cual (ya comprobada arriba); la de origen, saneada.
      shortDescription: propia ?? sanitizeSupplierText(deOrigen),
      material: sanitizeSupplierText(it.material),
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

    // El CSV de Adivin trae PVP (pvp_sin_iva), NO coste neto: sin este
    // override, product-pricing aplicaría el x1,6 global ENCIMA del PVP
    // (doble margen, +60% — auditoría 2026-07-04). customFromPriceCents
    // fija el precio cliente exacto del CSV.
    if (cents != null && cents > 0) {
      await prisma.productOverride.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          customFromPriceCents: cents,
          updatedBy: "import-adivin",
          internalNotes: "PVP del CSV Adivin (customFromPriceCents evita doble margen)",
        },
        update: { customFromPriceCents: cents, updatedBy: "import-adivin" },
      });
    }

    // internalRef determinista (STM-XXXXXX) si aún no tiene
    if (!product.internalRef) {
      await prisma.product.update({
        where: { id: product.id },
        data: { internalRef: generateInternalRef(product.id) },
      }).catch(() => {});
    }
  }

  log(`\nRESULTADO: ${created} creados · ${updated} actualizados · ${withPrice} con precio (activos) · ${inactive} sin precio (inactivos)`);
  log(`Texto de mayorista saneado en ${saneados} de ${bySref.size} descripciones.`);

  // Familias capturadas a trozos: soporte y gráfica sueltos y ningún conjunto
  // que comprar. El importador no las puede arreglar —el pack no está en el
  // seed— pero sí decir cuáles faltan por capturar del catálogo de origen.
  const huecos = detectarFamiliasSinPack(seed);
  if (huecos.length > 0) {
    log(`\nFamilias sin producto completo (${huecos.length}) — falta capturar su pack:`);
    for (const h of huecos) {
      log(`  ${h.familia}`);
      log(`    soporte: ${h.soportes.join(", ") || "—"}`);
      log(`    gráfica: ${h.graficas.join(", ") || "—"}`);
    }
    log(`  → El pack completo suele ser más barato que la suma de las piezas: mientras falte, la ficha ofrece medias piezas.`);
  }
  if (!COMMIT) log("DRY-RUN: no se ha escrito nada. Añade --commit para aplicar.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
