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

  it("exige el delimitador exacto entre raíz y sufijo", () => {
    expect(parseCifraVariantDimensions("T-691L-MA", "T-691")).toEqual({
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
    ["T-691-L-MA", "T-691"],
    ["T-791-L-MA", "T-791"],
  ])("recupera Formentera %s aunque la fila heredada esté vacía", (sku, rootmodel) => {
    const variant = normalizeLegacyCifraVariant(
      {
        id: `opaque-${rootmodel}`,
        sku,
        colorName: null,
        colorGroup: null,
        colorHex: null,
        size: null,
        imageUrl: null,
        stockQty: 0,
      },
      rootmodel,
    );
    const options = groupColorOptions([variant]);

    expect(variant).toMatchObject({ colorName: "Marino", colorGroup: "azul", size: "L" });
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ colorName: "Marino", ambiguous: false });
    expect(options[0].sizes.map((size) => size.size)).toEqual(["L"]);
    expect(resolveOrderVariantSelection(options, null)).toMatchObject({
      prompt: null,
      variant: { variantId: `opaque-${rootmodel}`, colorName: "Marino", size: "L" },
    });
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
    expect(normalizeLegacyCifraVariant(partial, "T-691")).toEqual(partial);
  });
});
