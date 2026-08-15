import { describe, it, expect } from "vitest";
import {
  canonicalColorGroup,
  colorGroupFromName,
  currentVariantQuantityLines,
  extractSize,
  groupColorOptions,
  resolveOrderVariantSelection,
  selectableSizesForOption,
  type ColorOption,
  type VariantInput,
} from "./variant-grouping";

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
    expect(azul.sizes.find((s) => s.size === "M")!.variantId).toBe("S17000-BF-M");
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
    expect(opts.find((o) => o.colorName === "Negro")!.primaryVariantId).toBe("MO9268-03");
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

  it("conserva variantes solo-talla sin color en una opción neutra", () => {
    const opts = groupColorOptions([
      v({ sku: "CAM-S", size: "S", stockQty: 10 }),
      v({ sku: "CAM-M", size: "M", stockQty: 12 }),
    ]);

    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      key: "__no_color__",
      colorName: null,
      variantCount: 2,
      untaggedVariantCount: 0,
      ambiguous: false,
    });
    expect(opts[0].sizes.map((size) => [size.size, size.variantId])).toEqual([
      ["S", "CAM-S"],
      ["M", "CAM-M"],
    ]);
  });

  it("marca como ambiguos los SKU sin discriminante o con color+talla duplicado", () => {
    const noDiscriminant = groupColorOptions([
      v({ sku: "ROOT-A" }),
      v({ sku: "ROOT-B" }),
    ]);
    expect(noDiscriminant[0].ambiguous).toBe(true);

    const duplicateSize = groupColorOptions([
      v({ sku: "BLUE-M-1", colorName: "AZUL", size: "M" }),
      v({ sku: "BLUE-M-2", colorName: "AZUL", size: "M" }),
    ]);
    expect(duplicateSize[0].ambiguous).toBe(true);
  });

  it("solo serializa ProductVariant.id y nunca el SKU proveedor", () => {
    const opts = groupColorOptions([
      v({ id: "cm-opaco-s", sku: "10866-S-NE", colorName: "Negro", size: "S" }),
      v({ id: "cm-opaco-m", sku: "10866-M-NE", colorName: "Negro", size: "M" }),
    ]);
    const serialized = JSON.stringify(opts);

    expect(serialized).toContain("cm-opaco-s");
    expect(serialized).not.toContain("10866-S-NE");
    expect(Object.keys(opts[0].sizes[0])).toEqual(["size", "variantId", "stockQty"]);
  });
});

describe("resolveOrderVariantSelection", () => {
  const color = (
    colorName: string,
    primaryVariantId: string,
    sizes: ColorOption["sizes"] = [],
  ): ColorOption => ({
    key: colorName.toLowerCase(),
    colorName,
    colorHex: null,
    imageUrl: `/${colorName.toLowerCase()}.jpg`,
    sizes,
    primaryVariantId,
    totalStock: 10,
    variantCount: sizes.length || 1,
    untaggedVariantCount: sizes.length > 0 ? 0 : 1,
    ambiguous: false,
  });

  it("exige color cuando hay varias opciones", () => {
    const options = [color("AZUL", "azul"), color("ROJO", "rojo")];
    expect(resolveOrderVariantSelection(options, null)).toEqual({
      variant: null,
      prompt: "Elige un color",
    });
    expect(
      resolveOrderVariantSelection(options, {
        variantId: "rojo",
        optionKey: "rojo",
        colorName: "ROJO",
        size: null,
        imageUrl: "/rojo.jpg",
      }),
    ).toEqual({
      variant: {
        variantId: "rojo",
        optionKey: "rojo",
        colorName: "ROJO",
        size: null,
        imageUrl: "/rojo.jpg",
      },
      prompt: null,
    });
  });

  it("descarta estado obsoleto y reconstruye la variante canónica", () => {
    const stale = {
      variantId: "variant-producto-anterior",
      optionKey: "azul",
      colorName: "AZUL",
      size: null,
      imageUrl: "/anterior.jpg",
    };
    expect(resolveOrderVariantSelection([], stale)).toEqual({
      variant: null,
      prompt: null,
    });
    expect(
      resolveOrderVariantSelection([color("AZUL", "azul-canonico")], stale),
    ).toEqual({
      variant: {
        variantId: "azul-canonico",
        optionKey: "azul",
        colorName: "AZUL",
        size: null,
        imageUrl: "/azul.jpg",
      },
      prompt: null,
    });
    expect(
      resolveOrderVariantSelection(
        [
          color("AZUL", "azul-m", [
            { variantId: "azul-m", size: "M", stockQty: 5 },
            { variantId: "azul-l", size: "L", stockQty: 5 },
          ]),
        ],
        stale,
      ),
    ).toEqual({ variant: null, prompt: "Elige una talla" });
  });

  it("exige talla solo cuando existe una elección real", () => {
    const option = color("AZUL", "azul-m", [
      { variantId: "azul-s", size: "S", stockQty: 5 },
      { variantId: "azul-m", size: "M", stockQty: 5 },
    ]);
    expect(resolveOrderVariantSelection([option], null)).toEqual({
      variant: null,
      prompt: "Elige una talla",
    });
    expect(
      resolveOrderVariantSelection([option], {
        variantId: null,
        optionKey: "azul",
        colorName: "AZUL",
        size: null,
        imageUrl: "/azul.jpg",
      }),
    ).toEqual({ variant: null, prompt: "Elige una talla" });
  });

  it("resuelve automáticamente una variante única", () => {
    expect(resolveOrderVariantSelection([color("AZUL", "azul")], null)).toEqual({
      variant: {
        variantId: "azul",
        optionKey: "azul",
        colorName: "AZUL",
        size: null,
        imageUrl: "/azul.jpg",
      },
      prompt: null,
    });
    expect(
      resolveOrderVariantSelection(
        [
          color("AZUL", "azul-m", [
            { variantId: "azul-m", size: "M", stockQty: 5 },
          ]),
        ],
        null,
      ),
    ).toEqual({
      variant: {
        variantId: "azul-m",
        optionKey: "azul",
        colorName: "AZUL",
        size: "M",
        imageUrl: "/azul.jpg",
      },
      prompt: null,
    });
  });

  it("resuelve talla neutra exacta y nunca pierde variantes sin color", () => {
    const options = groupColorOptions([
      v({ sku: "CAM-S", size: "S", stockQty: 5 }),
      v({ sku: "CAM-M", size: "M", stockQty: 5 }),
    ]);
    expect(resolveOrderVariantSelection(options, null)).toEqual({
      variant: null,
      prompt: "Elige una talla",
    });
    expect(
      resolveOrderVariantSelection(options, {
        variantId: "CAM-M",
        optionKey: "__no_color__",
        colorName: null,
        size: "M",
        imageUrl: null,
      }),
    ).toEqual({
      variant: {
        variantId: "CAM-M",
        optionKey: "__no_color__",
        colorName: null,
        size: "M",
        imageUrl: null,
      },
      prompt: null,
    });
  });

  it("bloquea grupos ambiguos en vez de elegir un SKU arbitrario", () => {
    const options = groupColorOptions([v({ sku: "A" }), v({ sku: "B" })]);
    expect(resolveOrderVariantSelection(options, null)).toEqual({
      variant: null,
      prompt: "Solicita revisión de variante",
    });
  });

  it("usa stock solo para excluir, nunca para escoger entre tallas elegibles", () => {
    const option = color("AZUL", "azul-s", [
      { variantId: "azul-s", size: "S", stockQty: 0 },
      { variantId: "azul-m", size: "M", stockQty: 8 },
    ]);
    expect(resolveOrderVariantSelection([option], null)).toMatchObject({
      variant: { variantId: "azul-m", size: "M" },
      prompt: null,
    });

    const underOrder = color("AZUL", "azul-s", [
      { variantId: "azul-s", size: "S", stockQty: 0 },
      { variantId: "azul-m", size: "M", stockQty: 0 },
    ]);
    expect(resolveOrderVariantSelection([underOrder], null)).toEqual({
      variant: null,
      prompt: "Elige una talla",
    });
  });

  it("ignora una talla stale aunque coincida la clave de color", () => {
    const current = color("AZUL", "actual-l", [
      { variantId: "actual-l", size: "L", stockQty: 5 },
    ]);
    expect(
      selectableSizesForOption(current).find((size) => size.variantId === "anterior-m"),
    ).toBeUndefined();
    expect(
      resolveOrderVariantSelection([current], {
        variantId: "anterior-m",
        optionKey: "azul",
        colorName: "AZUL",
        size: "M",
        imageUrl: "/anterior.jpg",
      }),
    ).toMatchObject({
      variant: { variantId: "actual-l", size: "L", imageUrl: "/azul.jpg" },
      prompt: null,
    });
  });
});

describe("currentVariantQuantityLines", () => {
  it("ignora cantidades del color anterior durante el render previo al efecto", () => {
    const quantities = { "AZUL-S": 20, "ROJO-M": 5, "ROJO-L": 0 };
    const currentSizes = [
      { variantId: "ROJO-M", size: "M", stockQty: 10 },
      { variantId: "ROJO-L", size: "L", stockQty: 10 },
    ];

    expect(currentVariantQuantityLines(currentSizes, quantities)).toEqual([
      { variantId: "ROJO-M", size: "M", stockQty: 10, quantity: 5 },
    ]);
    expect(
      currentVariantQuantityLines(
        [{ variantId: "VERDE-XL", size: "XL", stockQty: 10 }],
        quantities,
      ),
    ).toEqual([]);
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

describe("canonicalColorGroup — unifica el vocabulario de los 3 proveedores", () => {
  it("MidOcean (mayúscula/inglés) → canónico minúsculas-sin-acento", () => {
    const cases: [string, string][] = [
      ["Azul", "azul"],
      ["Marrón", "marron"],   // MidOcean con tilde y mayúscula
      ["Purple", "morado"],   // inglés
      ["Oro", "dorado"],
      ["Plateado", "gris"],
      ["Mix ES", "multicolor"],
      ["Rosa", "rosa"],
      ["Amarillo", "amarillo"],
    ];
    for (const [raw, group] of cases) expect(canonicalColorGroup(raw), raw).toBe(group);
  });

  it("Cifra (minúscula/tilde) converge al MISMO token que MidOcean/Makito", () => {
    // El bug: "Marrón"(MidOcean) y "marrón"(Cifra) y "marron"(derivado Makito)
    // eran 3 facetas distintas. Ahora los tres → "marron".
    expect(canonicalColorGroup("Marrón")).toBe("marron");
    expect(canonicalColorGroup("marrón")).toBe("marron");
    expect(colorGroupFromName("Marrón")).toBe("marron");
    expect(canonicalColorGroup("lila")).toBe("morado");
  });

  it("null/vacío → null; token desconocido → normalizado (no pierde agrupamiento)", () => {
    expect(canonicalColorGroup(null)).toBeNull();
    expect(canonicalColorGroup("")).toBeNull();
    expect(canonicalColorGroup("   ")).toBeNull();
    // Un grupo que no mapea a familia conocida se conserva normalizado.
    expect(canonicalColorGroup("Fluorescente")).toBe("fluorescente");
  });
});
