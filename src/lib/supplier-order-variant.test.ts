import { describe, expect, it } from "vitest";
import type { SupplierCode } from "@prisma/client";
import type { ResolvedProductSlug } from "./product-slug-resolver";
import { resolveSupplierOrderVariants } from "./supplier-order-variant";

type Product = ResolvedProductSlug<{
  slug: string;
  supplier: SupplierCode;
  supplierRef: string;
  _count: { variants: number };
  variants: Array<{ sku: string; colorName: string | null; size: string | null }>;
}>;

function lookup(rows: Record<string, Product>) {
  return async () => new Map(Object.entries(rows));
}

function product(
  requestedSlug: string,
  variantSkus: string[],
  canonicalSlug = requestedSlug,
): Product {
  return {
    requestedSlug,
    canonicalSlug,
    redirected: canonicalSlug !== requestedSlug,
    product: {
      slug: canonicalSlug,
      supplier: "midocean",
      supplierRef: "MO-ROOT",
      _count: { variants: variantSkus.length },
      variants: variantSkus.map((sku) => ({ sku, colorName: null, size: null })),
    },
  };
}

describe("resolveSupplierOrderVariants", () => {
  it("usa supplierRef para cero variantes y el SKU único para una", async () => {
    const rows = {
      root: product("root", []),
      unique: product("unique", ["MO-UNIQUE"]),
    };
    const result = await resolveSupplierOrderVariants(
      [
        { productSlug: "root", productRef: "STM-PUBLIC", variantSku: null },
        { productSlug: "unique", productRef: "STM-PUBLIC-2", variantSku: null },
      ],
      "midocean",
      lookup(rows),
    );

    expect(result).toEqual({
      ok: true,
      items: [
        {
          supplier: "midocean",
          supplierRef: "MO-ROOT",
          sku: "MO-ROOT",
          colorName: null,
          size: null,
          canonicalSlug: "root",
        },
        {
          supplier: "midocean",
          supplierRef: "MO-ROOT",
          sku: "MO-UNIQUE",
          colorName: null,
          size: null,
          canonicalSlug: "unique",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("STM-PUBLIC");
  });

  it("conserva un SKU explícito y resuelve slugs históricos", async () => {
    const row = product("old-slug", ["MO-ONE", "MO-TWO"], "new-slug");
    const result = await resolveSupplierOrderVariants(
      [{ productSlug: "old-slug", variantSku: "MO-TWO" }],
      "midocean",
      lookup({ "old-slug": row }),
    );
    expect(result).toMatchObject({
      ok: true,
      items: [{ sku: "MO-TWO", canonicalSlug: "new-slug" }],
    });
  });

  it("corta SKU nulo con varias variantes", async () => {
    const result = await resolveSupplierOrderVariants(
      [{ productSlug: "multi", productRef: "STM-NEVER" }],
      "midocean",
      lookup({ multi: product("multi", ["MO-A", "MO-B"]) }),
    );
    expect(result).toEqual({
      ok: false,
      code: "variant_required",
      error: "El producto multi necesita una variante exacta",
    });
  });

  it("corta producto desconocido o proveedor incorrecto", async () => {
    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "missing" }],
        undefined,
        lookup({}),
      ),
    ).toMatchObject({ ok: false, code: "unknown_product" });

    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "known", variantSku: "MO-A" }],
        "cifra",
        lookup({ known: product("known", ["MO-A"]) }),
      ),
    ).toMatchObject({ ok: false, code: "supplier_mismatch" });
  });

  it("rechaza un SKU ajeno y no confía en el navegador", async () => {
    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "known", variantSku: "SKU-AJENO" }],
        "midocean",
        lookup({ known: product("known", ["MO-A", "MO-B"]) }),
      ),
    ).toMatchObject({ ok: false, code: "invalid_variant" });
  });

  it("devuelve color y talla canónicos de BD para no confiar en el POST", async () => {
    const row = product("camiseta", ["CAM-AZ-M"]);
    row.product.variants[0] = {
      sku: "CAM-AZ-M",
      colorName: "AZUL",
      size: "M",
    };

    const result = await resolveSupplierOrderVariants(
      [{ productSlug: "camiseta", variantSku: "CAM-AZ-M" }],
      "midocean",
      lookup({ camiseta: row }),
    );

    expect(result).toMatchObject({
      ok: true,
      items: [{ sku: "CAM-AZ-M", colorName: "AZUL", size: "M" }],
    });
  });
});
