import { describe, it, expect } from "vitest";
import { RecommendSchema, MAX_CATEGORY_CHARS, MAX_CATEGORIES } from "./recommend-request";

const base = { brief: "Necesito merchandising para una feria tecnológica en Madrid" };

describe("RecommendSchema", () => {
  it("acepta lo que manda el formulario del recomendador", () => {
    const r = RecommendSchema.safeParse({
      ...base,
      budget: 1000,
      quantity: 100,
      preferredCategories: ["Textil", "Escritura", "Bolsas y mochilas"],
      ecoOnly: true,
    });
    expect(r.success).toBe(true);
  });

  it("acepta el caso mínimo: solo brief", () => {
    expect(RecommendSchema.safeParse(base).success).toBe(true);
  });

  // El agujero de coste: cada categoría acaba en el prompt que se factura.
  it("rechaza una categoría por encima del tope aunque el array sea corto", () => {
    const larga = "x".repeat(MAX_CATEGORY_CHARS + 1);
    expect(
      RecommendSchema.safeParse({ ...base, preferredCategories: [larga] }).success,
    ).toBe(false);
  });

  it("acepta el nombre de categoría más largo del catálogo real (46 caracteres)", () => {
    expect(
      RecommendSchema.safeParse({ ...base, preferredCategories: ["x".repeat(46)] }).success,
    ).toBe(true);
  });

  it("sigue capando el NÚMERO de categorías, no solo su longitud", () => {
    const muchas = Array.from({ length: MAX_CATEGORIES + 1 }, () => "Textil");
    expect(RecommendSchema.safeParse({ ...base, preferredCategories: muchas }).success).toBe(false);
  });

  it("una categoría desmedida no se cuela por ir acompañada de otras válidas", () => {
    expect(
      RecommendSchema.safeParse({
        ...base,
        preferredCategories: ["Textil", "y".repeat(5000), "Escritura"],
      }).success,
    ).toBe(false);
  });

  it("mantiene los topes que ya existían en el resto de campos del prompt", () => {
    expect(RecommendSchema.safeParse({ brief: "corto" }).success).toBe(false);
    expect(RecommendSchema.safeParse({ brief: "b".repeat(2001) }).success).toBe(false);
    expect(RecommendSchema.safeParse({ ...base, followUp: "f".repeat(1001) }).success).toBe(false);
    expect(
      RecommendSchema.safeParse({
        ...base,
        history: [{ role: "user", content: "c".repeat(1501) }],
      }).success,
    ).toBe(false);
  });
});
