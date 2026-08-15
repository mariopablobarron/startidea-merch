import { describe, expect, it } from "vitest";
import {
  canonicalizeQuoteRequestVariantSelection,
  validateQuoteRequestVariantDistribution,
} from "./quote-request-variant";

describe("validateQuoteRequestVariantDistribution", () => {
  it("acepta una variante individual o una matriz que suma qty", () => {
    expect(validateQuoteRequestVariantDistribution(25, "SKU-1", undefined)).toBeNull();
    expect(
      validateQuoteRequestVariantDistribution(25, null, [
        { sku: "SKU-S", quantity: 10 },
        { sku: "SKU-M", quantity: 15 },
      ]),
    ).toBeNull();
  });

  it("rechaza modos mezclados, suma distinta o SKU duplicado", () => {
    expect(
      validateQuoteRequestVariantDistribution(25, "SKU-1", [
        { sku: "SKU-S", quantity: 25 },
      ]),
    ).toContain("no ambos");
    expect(
      validateQuoteRequestVariantDistribution(25, null, [
        { sku: "SKU-S", quantity: 24 },
      ]),
    ).toContain("no coincide");
    expect(
      validateQuoteRequestVariantDistribution(25, null, [
        { sku: "SKU-S", quantity: 10 },
        { sku: "SKU-S", quantity: 15 },
      ]),
    ).toContain("no coincide");
  });

  it("distingue revisión manual de una matriz explícita vacía", () => {
    expect(
      validateQuoteRequestVariantDistribution(25, null, undefined),
    ).toBeNull();
    expect(
      validateQuoteRequestVariantDistribution(1, null, []),
    ).toContain("al menos una cantidad");
  });
});

describe("canonicalizeQuoteRequestVariantSelection", () => {
  it("ignora color/talla adulterados y usa los metadatos canónicos del SKU", () => {
    expect(
      canonicalizeQuoteRequestVariantSelection(
        {
          variantSku: "CAM-AZ-M",
          colorName: "ROJO FALSO",
          size: "XL",
        },
        [{ sku: "CAM-AZ-M", colorName: "AZUL", size: "M" }],
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
            { sku: "CAM-S", colorName: "FALSO", size: "XXL", quantity: 10 },
            { sku: "CAM-M", colorName: "FALSO", size: "XXL", quantity: 15 },
          ],
        },
        [
          { sku: "CAM-S", colorName: "AZUL", size: "S" },
          { sku: "CAM-M", colorName: "AZUL", size: "M" },
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
        [{ sku: "CAM-M", colorName: "AZUL", size: "M" }],
      ),
    ).toBeNull();
  });
});
