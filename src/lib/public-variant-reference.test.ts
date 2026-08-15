import { describe, expect, it } from "vitest";
import type { ResolvedProductSlug } from "./product-slug-resolver";
import { resolvePublicVariantReferences } from "./public-variant-reference";

function lookup() {
  const product = {
    slug: "camiseta",
    supplier: "midocean" as const,
    supplierRef: "MO-ROOT",
    variants: [
      {
        id: "opaque-s",
        sku: "MO-SECRET-S",
        colorName: "AZUL",
        colorGroup: "azul",
        colorHex: null,
        size: "S",
      },
      {
        id: "opaque-m",
        sku: "MO-SECRET-M",
        colorName: "AZUL",
        colorGroup: "azul",
        colorHex: null,
        size: "M",
      },
    ],
  };
  const row: ResolvedProductSlug<typeof product> = {
    requestedSlug: "old-camiseta",
    canonicalSlug: "camiseta",
    redirected: true,
    product,
  };
  return async () => new Map([["old-camiseta", row]]);
}

function cifraLookup() {
  const product = {
    slug: "camiseta-adulto-runner",
    supplier: "cifra" as const,
    supplierRef: "10866",
    variants: [
      {
        id: "opaque-runner-l",
        sku: "10866-L-NE",
        colorName: "L-NE",
        colorGroup: null,
        colorHex: null,
        size: null,
      },
    ],
  };
  const row: ResolvedProductSlug<typeof product> = {
    requestedSlug: "camiseta-adulto-runner",
    canonicalSlug: "camiseta-adulto-runner",
    redirected: false,
    product,
  };
  return async () => new Map([["camiseta-adulto-runner", row]]);
}

describe("resolvePublicVariantReferences", () => {
  it("convierte SKU histórico a ID opaco y conserva metadata canónica", async () => {
    const result = await resolvePublicVariantReferences(
      [{ productSlug: "old-camiseta", variantSku: "MO-SECRET-M" }],
      lookup(),
    );

    expect(result).toEqual([{
      variantId: "opaque-m",
      colorName: "AZUL",
      size: "M",
      requiresVariantReview: false,
    }]);
    expect(JSON.stringify(result)).not.toContain("MO-SECRET");
  });

  it("marca para revisión un SKU retirado o una línea ambigua", async () => {
    expect(
      await resolvePublicVariantReferences(
        [
          { productSlug: "old-camiseta", variantSku: "SKU-RETIRADO" },
          { productSlug: "old-camiseta", variantSku: null },
        ],
        lookup(),
      ),
    ).toEqual([
      { variantId: null, colorName: null, size: null, requiresVariantReview: true },
      { variantId: null, colorName: null, size: null, requiresVariantReview: true },
    ]);
  });

  it("recupera color y talla Cifra de un pedido Runner histórico sin exponer SKU", async () => {
    const result = await resolvePublicVariantReferences(
      [{ productSlug: "camiseta-adulto-runner", variantSku: "10866-L-NE" }],
      cifraLookup(),
    );

    expect(result).toEqual([{
      variantId: "opaque-runner-l",
      colorName: "Negro",
      size: "L",
      requiresVariantReview: false,
    }]);
    expect(JSON.stringify(result)).not.toContain("10866-L-NE");
  });
});
