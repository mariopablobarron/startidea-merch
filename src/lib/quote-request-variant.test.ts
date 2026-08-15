import { describe, expect, it } from "vitest";
import {
  canonicalizeQuoteRequestVariantSelection,
  validateQuoteRequestVariantDistribution,
} from "./quote-request-variant";

describe("validateQuoteRequestVariantDistribution", () => {
  it("acepta una variante individual o una matriz que suma qty", () => {
    expect(validateQuoteRequestVariantDistribution(25, "variant-1", null, undefined)).toBeNull();
    expect(
      validateQuoteRequestVariantDistribution(25, null, null, [
        { variantId: "variant-s", quantity: 10 },
        { variantId: "variant-m", quantity: 15 },
      ]),
    ).toBeNull();
  });

  it("rechaza modos mezclados, suma distinta o SKU duplicado", () => {
    expect(
      validateQuoteRequestVariantDistribution(25, "variant-1", null, [
        { variantId: "variant-s", quantity: 25 },
      ]),
    ).toContain("no ambos");
    expect(
      validateQuoteRequestVariantDistribution(25, null, null, [
        { variantId: "variant-s", quantity: 24 },
      ]),
    ).toContain("no coincide");
    expect(
      validateQuoteRequestVariantDistribution(25, null, null, [
        { variantId: "variant-s", quantity: 10 },
        { variantId: "variant-s", quantity: 15 },
      ]),
    ).toContain("no coincide");
  });

  it("distingue revisión manual de una matriz explícita vacía", () => {
    expect(
      validateQuoteRequestVariantDistribution(25, null, null, undefined),
    ).toBeNull();
    expect(
      validateQuoteRequestVariantDistribution(1, null, null, []),
    ).toContain("al menos una cantidad");
  });
});

describe("canonicalizeQuoteRequestVariantSelection", () => {
  it("ignora color/talla adulterados y usa los metadatos canónicos del SKU", () => {
    expect(
      canonicalizeQuoteRequestVariantSelection(
        {
          variantId: "variant-az-m",
          colorName: "ROJO FALSO",
          size: "XL",
        },
        [{ variantId: "variant-az-m", sku: "CAM-AZ-M", colorName: "AZUL", size: "M" }],
      ),
    ).toEqual({
      summary: "CAM-AZ-M · AZUL · talla M",
      variantSku: "CAM-AZ-M",
      colorName: "AZUL",
      size: "M",
    });
  });

  it("canonicaliza cada línea y falla si el resultado no está alineado", () => {
    expect(
      canonicalizeQuoteRequestVariantSelection(
        {
          variantLines: [
            { variantId: "variant-s", colorName: "FALSO", size: "XXL", quantity: 10 },
            { variantId: "variant-m", colorName: "FALSO", size: "XXL", quantity: 15 },
          ],
        },
        [
          { variantId: "variant-s", sku: "CAM-S", colorName: "AZUL", size: "S" },
          { variantId: "variant-m", sku: "CAM-M", colorName: "AZUL", size: "M" },
        ],
      ),
    ).toMatchObject({
      summary: "10× CAM-S · AZUL · talla S · 15× CAM-M · AZUL · talla M",
      variantLines: [
        { sku: "CAM-S", colorName: "AZUL", size: "S", quantity: 10 },
        { sku: "CAM-M", colorName: "AZUL", size: "M", quantity: 15 },
      ],
    });
    expect(
      canonicalizeQuoteRequestVariantSelection(
        { variantSku: "CAM-X" },
        [{ variantId: "variant-m", sku: "CAM-M", colorName: "AZUL", size: "M" }],
      ),
    ).toBeNull();
  });
});
