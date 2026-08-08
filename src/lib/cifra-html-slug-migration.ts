import { legacyHtmlToText } from "@/lib/product-name";
import { slugify } from "@/lib/suppliers/midocean";

export const CIFRA_HTML_SLUG_MIGRATION_KEY = "cifra_html_slug_migration_20260808";
export const EXPECTED_CIFRA_HTML_OLD_SLUGS = [
  "pbalon-de-reglamento",
  "pboligrafo-guardia-civil-tricorniop",
  "pboligrafo-policia-local-fortep",
  "pbolsa-fieltro-para-vino",
  "pcartera-monedero-barlettap",
  "pcubo-antiestres-bloquep",
  "pdoctora-antiestres-galenap",
  "pgafas-de-sol",
  "pjuego-de-habilidad",
  "pllavero-diplomadop",
  "pmug-sublimacion-250-ml-blanca",
  "psecador-ionico-bldc-8-piezas-pierre-cardin-milanop",
  "pset-de-gomas",
  "ptrofeo-deportivo-golp",
  "ptrofeo-deportivo-pivotp",
  "ptrofeo-deportivo-smashp",
  "ptrofeo-orion-sublimacionp",
] as const;

export const EXPECTED_CIFRA_HTML_SLUG_TARGETS: Readonly<Record<string, string>> = {
  "pbalon-de-reglamento": "balon-de-reglamento",
  "pboligrafo-guardia-civil-tricorniop": "boligrafo-guardia-civil-tricornio",
  "pboligrafo-policia-local-fortep": "boligrafo-policia-local-forte",
  "pbolsa-fieltro-para-vino": "bolsa-fieltro-para-vino",
  "pcartera-monedero-barlettap": "cartera-monedero-barletta",
  "pcubo-antiestres-bloquep": "cubo-antiestres-bloque",
  "pdoctora-antiestres-galenap": "doctora-antiestres-galena",
  "pgafas-de-sol": "gafas-de-sol-3",
  "pjuego-de-habilidad": "juego-de-habilidad",
  "pllavero-diplomadop": "llavero-diplomado",
  "pmug-sublimacion-250-ml-blanca": "mug-sublimacion-250-ml-blanca",
  "psecador-ionico-bldc-8-piezas-pierre-cardin-milanop":
    "secador-ionico-bldc-8-piezas-pierre-cardin-milano",
  "pset-de-gomas": "set-de-gomas",
  "ptrofeo-deportivo-golp": "trofeo-deportivo-gol",
  "ptrofeo-deportivo-pivotp": "trofeo-deportivo-pivot",
  "ptrofeo-deportivo-smashp": "trofeo-deportivo-smash",
  "ptrofeo-orion-sublimacionp": "trofeo-orion-sublimacion",
};

export type SlugInventoryProduct = {
  id: string;
  supplier: string;
  supplierRef: string;
  internalRef: string | null;
  active: boolean;
  name: string;
  slug: string;
};

export type CifraHtmlSlugPlanItem = {
  productId: string;
  supplierRef: string;
  internalRef: string | null;
  name: string;
  oldSlug: string;
  newSlug: string;
};

const MAX_SUFFIX = 999;

function cleanSlugBase(name: string): string {
  return slugify(legacyHtmlToText(name)) || "producto";
}

/**
 * El importador antiguo generaba el slug desde `<p>Nombre</p>` sin quitar el
 * markup. Su slugifier eliminaba `<`, `>` y `/`, pero conservaba las letras de
 * la etiqueta: `pnombrep` (o `pnombre` si el cierre faltaba).
 *
 * Se reconoce por relación con el nombre limpio, no solo por empezar por `p`:
 * así no tocamos slugs legítimos de productos cuyo nombre comience por P.
 */
export function isLegacyCifraParagraphSlug(name: string, slug: string): boolean {
  const base = cleanSlugBase(name);
  return slug === `p${base}` || slug === `p${base}p`;
}

function pickAvailableSlug(base: string, reserved: ReadonlySet<string>): string {
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (!reserved.has(candidate)) return candidate;
  }
  throw new Error(`No hay slug libre para ${base} tras ${MAX_SUFFIX} intentos`);
}

/**
 * Plan puro y determinista. `products` contiene TODO el catálogo, incluidos
 * inactivos, porque sus slugs siguen reservados. `redirectOldSlugs` comparte el
 * mismo namespace lógico: nunca reutilizamos una URL histórica como slug vivo.
 */
export function buildCifraHtmlSlugPlan(
  products: ReadonlyArray<SlugInventoryProduct>,
  redirectOldSlugs: ReadonlyArray<string>,
): CifraHtmlSlugPlanItem[] {
  const reserved = new Set<string>([
    ...products.map((product) => product.slug),
    ...redirectOldSlugs,
  ]);

  const candidates = products
    .filter(
      (product) =>
        product.supplier === "cifra" &&
        product.active &&
        isLegacyCifraParagraphSlug(product.name, product.slug),
    )
    .sort((a, b) =>
      a.supplierRef.localeCompare(b.supplierRef, "es") || a.id.localeCompare(b.id, "es"),
    );

  return candidates.map((product) => {
    const name = legacyHtmlToText(product.name);
    const newSlug = pickAvailableSlug(cleanSlugBase(product.name), reserved);
    reserved.add(newSlug);
    return {
      productId: product.id,
      supplierRef: product.supplierRef,
      internalRef: product.internalRef,
      name,
      oldSlug: product.slug,
      newSlug,
    };
  });
}

/**
 * Cinturón one-shot: aplicar solo el inventario auditado en producción. Un
 * candidato nuevo, ausente o modificado obliga a repetir el dry-run y revisar,
 * en vez de ampliar silenciosamente el radio de la migración.
 */
export function assertExpectedCifraHtmlSlugPlan(plan: ReadonlyArray<CifraHtmlSlugPlanItem>): void {
  if (plan.length === 0) return; // reejecución idempotente tras aplicar
  const actual = [...plan.map((item) => item.oldSlug)].sort();
  const expected = [...EXPECTED_CIFRA_HTML_OLD_SLUGS].sort();
  if (actual.length !== expected.length || actual.some((slug, index) => slug !== expected[index])) {
    throw new Error(
      `El inventario cambió: esperados ${expected.length} slugs auditados; recibidos ${actual.length}`,
    );
  }
  for (const item of plan) {
    const expectedTarget = EXPECTED_CIFRA_HTML_SLUG_TARGETS[item.oldSlug];
    if (item.newSlug !== expectedTarget) {
      throw new Error(
        `El inventario cambió: ${item.oldSlug} debía migrar a ${expectedTarget}, no a ${item.newSlug}`,
      );
    }
  }
}
