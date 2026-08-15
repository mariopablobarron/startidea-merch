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
    ["T-691-L-MA", "T-691", "Marino", "L"],
    ["T-791-L-MA", "T-791", "Marino", "L"],
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
});
