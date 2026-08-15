import { describe, expect, it } from "vitest";
import { groupColorOptions, resolveOrderVariantSelection } from "@/lib/variant-grouping";
import {
  normalizeLegacyCifraVariant,
  parseCifraVariantDimensions,
} from "./cifra-variant";

describe("parseCifraVariantDimensions", () => {
  it.each([
    ["10866-L-NE", "10866", "Negro", "L"],
    ["11035-3XL-MA", "11035", "Marino", "3XL"],
    ["T-691-L-MA", "T-690", "Marino", "L"],
    ["T-694-S-RY", "T-690", "Royal", "S"],
    ["T-791-L-MA", "T-790", "Marino", "L"],
    ["T-794-M-RY", "T-790", "Royal", "M"],
    ["T-527-L-NE", "T-525", "Negro", "L"],
    ["T-089-XL-AZ", "T-089", "Azul", "XL"],
    ["10050-VE", "10050", "Verde", null],
    ["10137-MA", "10137", "Marino", null],
    ["10200-LUPINE", "10200", "LUPINE", null],
  ])("separa %s sin inventar dimensiones", (model, root, colorName, size) => {
    expect(parseCifraVariantDimensions(model, root)).toMatchObject({ colorName, size });
  });

  it("no separa un código de color desconocido", () => {
    expect(parseCifraVariantDimensions("ABC-L-XX", "ABC")).toMatchObject({
      colorName: "L-XX",
      size: null,
    });
  });

  it("exige el delimitador exacto entre raíz y sufijo", () => {
    expect(parseCifraVariantDimensions("T-691L-MA", "T-691")).toEqual({
      colorName: null,
      colorGroup: null,
      colorHex: null,
      size: null,
    });
  });

  it.each([
    ["T-791-L-MA", "T-690"],
    ["ABC-L-MA", "T-690"],
  ])("no acepta la cola cerrada de otra familia: %s / %s", (model, rootmodel) => {
    expect(parseCifraVariantDimensions(model, rootmodel)).toEqual({
      colorName: null,
      colorGroup: null,
      colorHex: null,
      size: null,
    });
  });
});

describe("compatibilidad de filas Cifra heredadas", () => {
  it("convierte Runner en un color Negro con tallas elegibles", () => {
    const variants = ["S", "M", "L", "XL", "XXL"].map((size) =>
      normalizeLegacyCifraVariant(
        {
          id: `opaque-${size}`,
          sku: `10866-${size}-NE`,
          colorName: `${size}-NE`,
          colorGroup: null,
          colorHex: null,
          size: null,
          imageUrl: null,
          stockQty: 10,
        },
        "10866",
      ),
    );
    const options = groupColorOptions(variants);

    expect(options).toHaveLength(1);
    expect(options[0].colorName).toBe("Negro");
    expect(options[0].sizes.map((size) => size.size)).toEqual([
      "S", "M", "L", "XL", "XXL",
    ]);
    expect(resolveOrderVariantSelection(options, null)).toEqual({
      variant: null,
      prompt: "Elige una talla",
    });
    expect(JSON.stringify(options)).not.toContain("10866-");
  });

  it("no pisa una talla estructurada ni un color editado", () => {
    const structured = {
      sku: "10866-L-NE",
      colorName: "Negro editorial",
      colorGroup: "negro",
      colorHex: null,
      size: "M",
    };
    expect(normalizeLegacyCifraVariant(structured, "10866")).toEqual(structured);
  });

  it.each([
    ["hombre", "T-690", ["S", "M", "L", "XL", "XXL"], ["S"]],
    ["mujer", "T-790", ["S", "M", "L"], ["S", "M", "L"]],
  ])("recupera las dos familias Formentera %s con el rootmodel real", (_label, rootmodel, marinoSizes, royalSizes) => {
    const familyRoot = rootmodel === "T-690" ? "T-69" : "T-79";
    const rawVariants = [
      ...marinoSizes.map((size) => ({ sku: `${familyRoot}1-${size}-MA`, size })),
      ...royalSizes.map((size) => ({ sku: `${familyRoot}4-${size}-RY`, size })),
    ];
    const variants = rawVariants.map(({ sku }, index) =>
      normalizeLegacyCifraVariant(
        {
          id: `opaque-${index}`,
          sku,
          colorName: null,
          colorGroup: null,
          colorHex: null,
          size: null,
          imageUrl: null,
          stockQty: 10,
        },
        rootmodel,
      ),
    );
    const options = groupColorOptions(variants);

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.colorName)).toEqual(["Marino", "Royal"]);
    expect(options[0].sizes.map((size) => size.size)).toEqual(marinoSizes);
    expect(options[1].sizes.map((size) => size.size)).toEqual(royalSizes);
    expect(options.every((option) => option.ambiguous === false)).toBe(true);
    expect(resolveOrderVariantSelection(options, null)).toEqual({
      variant: null,
      prompt: "Elige un color",
    });
    expect(JSON.stringify(options)).not.toMatch(/T-69|T-79/);
  });

  it("no inventa atributos para una fila vacía con código desconocido", () => {
    const unknown = {
      sku: "ABC-L-XX",
      colorName: null,
      colorGroup: null,
      colorHex: null,
      size: null,
    };
    expect(normalizeLegacyCifraVariant(unknown, "ABC")).toEqual(unknown);
  });

  it.each([
    [{ colorGroup: "editorial", colorHex: null }],
    [{ colorGroup: null, colorHex: "#123456" }],
  ])("no pisa metadata parcial aunque color y talla estén vacíos", (metadata) => {
    const partial = {
      sku: "T-691-L-MA",
      colorName: null,
      size: null,
      ...metadata,
    };
    expect(normalizeLegacyCifraVariant(partial, "T-690")).toEqual(partial);
  });
});
