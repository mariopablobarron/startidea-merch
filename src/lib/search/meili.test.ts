import { describe, expect, it } from "vitest";
import { buildProductSearchDocument } from "./meili";

/**
 * Guardia anti-fuga: el documento que entra a Meilisearch no puede llevar
 * NADA del proveedor (nombre, ref interna suya, URL de su CDN). El índice
 * alimenta respuestas públicas del buscador.
 */
describe("buildProductSearchDocument", () => {
  const row = {
    id: "cmp123",
    slug: "camiseta-runner",
    name: 'CAMISETA ADULTO "RUNNER"',
    internalRef: "STM-MQXWG7",
    tags: ["camiseta", "textil"],
    shortDescription: "Camiseta técnica transpirable",
    primaryImageUrl: "https://cdn1.midocean.com/image/700X700/mo9999.jpg",
    category: { name: "Camisetas", parent: { name: "Textil" } },
  };

  it("mapea los campos públicos", () => {
    const doc = buildProductSearchDocument(row);
    expect(doc.id).toBe("cmp123");
    expect(doc.ref).toBe("STM-MQXWG7");
    expect(doc.categoryPath).toBe("Textil › Camisetas");
    expect(doc.imageUrl).toMatch(/^\/api\/m\//);
  });

  it("no filtra proveedor en NINGÚN campo (serializado completo)", () => {
    const json = JSON.stringify(buildProductSearchDocument(row)).toLowerCase();
    for (const banned of ["midocean", "makito", "cifra", "adivin", "supplier", "cdn1.", "cdn."]) {
      expect(json).not.toContain(banned);
    }
  });

  it("tolera producto sin categoría, imagen ni descripción", () => {
    const doc = buildProductSearchDocument({
      ...row,
      primaryImageUrl: null,
      shortDescription: null,
      category: null,
    });
    expect(doc.imageUrl).toBeNull();
    expect(doc.categoryPath).toBe("");
    expect(doc.shortDescription).toBe("");
  });

  it("trunca descripciones largas (documento ligero)", () => {
    const doc = buildProductSearchDocument({ ...row, shortDescription: "x".repeat(5000) });
    expect(doc.shortDescription.length).toBe(300);
  });
});
