import { describe, it, expect } from "vitest";
import { extractSize, groupColorOptions, colorGroupFromName, type VariantInput } from "./variant-grouping";

function v(partial: Partial<VariantInput> & { sku: string }): VariantInput {
  return {
    id: partial.id ?? partial.sku,
    colorName: null,
    colorGroup: null,
    size: null,
    imageUrl: null,
    stockQty: 0,
    ...partial,
  };
}

describe("extractSize", () => {
  it("usa el campo size cuando viene relleno (Makito lo rellena)", () => {
    expect(extractSize({ size: "XL", sku: "18009662105" })).toBe("XL");
    expect(extractSize({ size: "xxxl", sku: "x" })).toBe("XXXL");
    expect(extractSize({ size: "40", sku: "x" })).toBe("40"); // numérica válida SOLO desde size
  });

  it("extrae talla alfabética del sufijo del SKU (Sol's, size vacío)", () => {
    expect(extractSize({ size: null, sku: "S17000-BF-3XL" })).toBe("3XL");
    expect(extractSize({ size: "", sku: "S17000-WH-M" })).toBe("M");
    expect(extractSize({ size: null, sku: "S17000-EF-XXL" })).toBe("XXL");
  });

  it("NO trata sufijos NUMÉRICOS del SKU como talla (MidOcean: código de color)", () => {
    expect(extractSize({ size: null, sku: "MO9268-03" })).toBeNull();
    expect(extractSize({ size: null, sku: "MO7318-40" })).toBeNull();
    expect(extractSize({ size: null, sku: "MO9267-13" })).toBeNull();
  });

  it("NO trata sufijos alfabéticos no-talla como talla (Cifra: código de color)", () => {
    expect(extractSize({ size: null, sku: "10050-VE" })).toBeNull();
    expect(extractSize({ size: null, sku: "10137-MA" })).toBeNull();
    expect(extractSize({ size: null, sku: "10200-LUPINE" })).toBeNull();
  });
});

describe("groupColorOptions", () => {
  it("deduplica por color y ordena tallas naturalmente (Sol's BRIGHTON)", () => {
    const variants: VariantInput[] = [];
    for (const [c, code] of [
      ["Azul Brillante", "BF"],
      ["Blanco", "WH"],
    ] as const) {
      for (const t of ["3XL", "M", "S", "XL", "L", "XXL"]) {
        variants.push(
          v({ sku: `S17000-${code}-${t}`, colorName: c, stockQty: t === "M" ? 100 : 20 }),
        );
      }
    }
    const opts = groupColorOptions(variants);
    expect(opts).toHaveLength(2); // 2 colores, NO 12 swatches
    const azul = opts.find((o) => o.colorName === "Azul Brillante")!;
    expect(azul.sizes.map((s) => s.size)).toEqual(["S", "M", "L", "XL", "XXL", "3XL"]);
    expect(azul.sizes.find((s) => s.size === "M")!.sku).toBe("S17000-BF-M");
  });

  it("MidOcean: una opción por color, SIN tallas fantasma", () => {
    const variants = [
      v({ sku: "MO9268-03", colorName: "Negro" }),
      v({ sku: "MO9268-13", colorName: "Beig" }),
      v({ sku: "MO7318-40", colorName: "Madera" }),
    ];
    const opts = groupColorOptions(variants);
    expect(opts).toHaveLength(3);
    expect(opts.every((o) => o.sizes.length === 0)).toBe(true);
    expect(opts.find((o) => o.colorName === "Negro")!.primarySku).toBe("MO9268-03");
  });

  it("Makito: tallas desde el campo size, deduplicando el color", () => {
    const variants = [
      v({ sku: "18009662105", colorName: "Rosa Pastel", size: "S", stockQty: 10 }),
      v({ sku: "18009662106", colorName: "Rosa Pastel", size: "M", stockQty: 50 }),
      v({ sku: "18009662107", colorName: "Rosa Pastel", size: "XL", stockQty: 5 }),
    ];
    const opts = groupColorOptions(variants);
    expect(opts).toHaveLength(1);
    expect(opts[0].sizes.map((s) => s.size)).toEqual(["S", "M", "XL"]);
    expect(opts[0].totalStock).toBe(65);
  });
});

describe("colorGroupFromName", () => {
  it("mapea compuestos a su familia base", () => {
    const cases: [string, string][] = [
      ["Marino", "azul"],
      ["Azul Claro", "azul"],
      ["Marino Oscuro", "azul"],
      ["Verde Botella", "verde"],
      ["Verde Militar", "verde"],
      ["Kaki", "verde"],
      ["Fucsia", "rosa"],
      ["Salmón", "rosa"],
      ["Rosa Fluor", "rosa"],
      ["Burdeos", "rojo"],
      ["Granate", "rojo"],
      ["Naranja Fluor", "naranja"],
      ["Plateado", "gris"],
      ["Gris Oscuro", "gris"],
      ["Amarillo Fluor", "amarillo"],
      ["Natural", "beige"],
      ["Arena", "beige"],
      ["Beig", "beige"],
      ["Dorado", "dorado"],
      ["Morado", "morado"],
      ["Transparente", "transparente"],
      ["Negro", "negro"],
      ["Blanco", "blanco"],
    ];
    for (const [name, group] of cases) {
      expect(colorGroupFromName(name), name).toBe(group);
    }
  });

  it("combinaciones → multicolor", () => {
    expect(colorGroupFromName("Blanco/Rojo")).toBe("multicolor");
    expect(colorGroupFromName("Rainbow")).toBe("multicolor");
  });

  it("ruido no-color → null (no ensucia el filtro)", () => {
    for (const n of ["S/C", "Circular", "Estrella", "Papa Noel", "España", "", "   "]) {
      expect(colorGroupFromName(n), n).toBeNull();
    }
    expect(colorGroupFromName(null)).toBeNull();
  });

  it("es insensible a mayúsculas y acentos", () => {
    expect(colorGroupFromName("SALMON")).toBe("rosa");
    expect(colorGroupFromName("Púrpura")).toBe("morado");
  });
});
