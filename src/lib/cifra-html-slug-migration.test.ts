import { describe, expect, it } from "vitest";
import {
  assertExpectedCifraHtmlSlugPlan,
  buildCifraHtmlSlugPlan,
  EXPECTED_CIFRA_HTML_OLD_SLUGS,
  EXPECTED_CIFRA_HTML_SLUG_TARGETS,
  isLegacyCifraParagraphSlug,
  type SlugInventoryProduct,
} from "./cifra-html-slug-migration";

function product(
  overrides: Partial<SlugInventoryProduct> & Pick<SlugInventoryProduct, "id" | "name" | "slug">,
): SlugInventoryProduct {
  return {
    supplier: "cifra",
    supplierRef: overrides.id,
    internalRef: null,
    active: true,
    ...overrides,
  };
}

describe("isLegacyCifraParagraphSlug", () => {
  it("reconoce las dos formas producidas por <p> con y sin cierre", () => {
    expect(isLegacyCifraParagraphSlug("<p>GAFAS DE SOL</p>", "pgafas-de-solp")).toBe(true);
    expect(isLegacyCifraParagraphSlug("<p>GAFAS DE SOL", "pgafas-de-sol")).toBe(true);
  });

  it("sigue reconociendo el artefacto si un sync ya limpió el nombre", () => {
    expect(isLegacyCifraParagraphSlug("GAFAS DE SOL", "pgafas-de-sol")).toBe(true);
  });

  it("no toca un slug limpio ni uno que solo empieza por p de forma legítima", () => {
    expect(isLegacyCifraParagraphSlug("GAFAS DE SOL", "gafas-de-sol")).toBe(false);
    expect(isLegacyCifraParagraphSlug("PANTONE", "pantone")).toBe(false);
  });
});

describe("buildCifraHtmlSlugPlan", () => {
  it("reproduce los destinos de producción y reserva gafas-de-sol/-2", () => {
    const rows: SlugInventoryProduct[] = [
      product({ id: "a", supplierRef: "A", name: "<p>BALÓN DE REGLAMENTO", slug: "pbalon-de-reglamento" }),
      product({ id: "b", supplierRef: "B", name: "<p>BOLIGRAFO GUARDIA CIVIL “TRICORNIO”</p>", slug: "pboligrafo-guardia-civil-tricorniop" }),
      product({ id: "g", supplierRef: "G", internalRef: "STM-UCPWVH", name: "<p>GAFAS DE SOL", slug: "pgafas-de-sol" }),
      product({ id: "clean-name", supplierRef: "H", name: "<p>BOLIGRAFO MADERA/METAL PIERRE CARDIN “PANAMERA”</p>", slug: "boligrafo-maderametal-pierre-cardin-panamera" }),
      product({ id: "taken-1", supplier: "midocean", supplierRef: "T1", name: "GAFAS DE SOL", slug: "gafas-de-sol" }),
      product({ id: "taken-2", supplier: "makito", supplierRef: "T2", name: "GAFAS DE SOL", slug: "gafas-de-sol-2" }),
    ];

    expect(buildCifraHtmlSlugPlan(rows, [])).toEqual([
      expect.objectContaining({ oldSlug: "pbalon-de-reglamento", newSlug: "balon-de-reglamento" }),
      expect.objectContaining({ oldSlug: "pboligrafo-guardia-civil-tricorniop", newSlug: "boligrafo-guardia-civil-tricornio" }),
      expect.objectContaining({ oldSlug: "pgafas-de-sol", newSlug: "gafas-de-sol-3" }),
    ]);
  });

  it("reserva ProductSlugRedirect.oldSlug, incluidos tombstones", () => {
    const rows = [
      product({ id: "a", name: "<p>JUEGO DE HABILIDAD", slug: "pjuego-de-habilidad" }),
    ];
    expect(buildCifraHtmlSlugPlan(rows, ["juego-de-habilidad"])[0]?.newSlug).toBe(
      "juego-de-habilidad-2",
    );
  });

  it("reserva slugs de productos inactivos pero no los migra", () => {
    const rows = [
      product({ id: "active", name: "<p>SET DE GOMAS", slug: "pset-de-gomas" }),
      product({ id: "inactive", active: false, name: "SET DE GOMAS", slug: "set-de-gomas" }),
      product({ id: "dirty-inactive", active: false, name: "<p>OTRO", slug: "potro" }),
    ];
    const plan = buildCifraHtmlSlugPlan(rows, []);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.newSlug).toBe("set-de-gomas-2");
  });

  it("es determinista aunque la consulta entregue otro orden", () => {
    const a = product({ id: "a", supplierRef: "REF-A", name: "<p>TROFEO", slug: "ptrofeo" });
    const b = product({ id: "b", supplierRef: "REF-B", name: "<p>TROFEO</p>", slug: "ptrofeop" });
    const first = buildCifraHtmlSlugPlan([b, a], []);
    const second = buildCifraHtmlSlugPlan([a, b], []);
    expect(first).toEqual(second);
    expect(first.map((item) => item.newSlug)).toEqual(["trofeo", "trofeo-2"]);
  });

  it("aborta si el inventario no coincide con los 17 slugs auditados", () => {
    const plan = buildCifraHtmlSlugPlan(
      [product({ id: "surprise", name: "<p>SORPRESA", slug: "psorpresa" })],
      [],
    );
    expect(() => assertExpectedCifraHtmlSlugPlan(plan)).toThrow(/inventario cambió/i);
    expect(() => assertExpectedCifraHtmlSlugPlan([])).not.toThrow();
  });

  it("aborta si una colisión nueva cambia un destino ya auditado", () => {
    const plan = buildCifraHtmlSlugPlan(
      [
        product({ id: "affected", name: "<p>BALÓN DE REGLAMENTO", slug: "pbalon-de-reglamento" }),
        product({ id: "new-collision", supplier: "makito", name: "BALÓN", slug: "balon-de-reglamento" }),
      ],
      [],
    );
    const completePlan = EXPECTED_CIFRA_HTML_OLD_SLUGS.map((oldSlug) => {
      const existing = plan.find((item) => item.oldSlug === oldSlug);
      return existing ?? {
        productId: oldSlug,
        supplierRef: oldSlug,
        internalRef: null,
        name: oldSlug,
        oldSlug,
        newSlug: EXPECTED_CIFRA_HTML_SLUG_TARGETS[oldSlug]!,
      };
    });
    expect(() => assertExpectedCifraHtmlSlugPlan(completePlan)).toThrow(/debía migrar/i);
  });
});
