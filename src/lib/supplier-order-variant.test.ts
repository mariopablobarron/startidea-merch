import { describe, expect, it } from "vitest";
import type { SupplierCode } from "@prisma/client";
import type { ResolvedProductSlug } from "./product-slug-resolver";
import { resolveSupplierOrderVariants } from "./supplier-order-variant";

type Product = ResolvedProductSlug<{
  slug: string;
  supplier: SupplierCode;
  supplierRef: string;
  _count: { variants: number };
  variants: Array<{
    id: string;
    sku: string;
    colorName: string | null;
    colorGroup: string | null;
    colorHex: string | null;
    size: string | null;
  }>;
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
      variants: variantSkus.map((sku, index) => ({
        id: `variant-${index + 1}`,
        sku,
        colorName: null,
        colorGroup: null,
        colorHex: null,
        size: null,
      })),
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
          variantId: null,
          sku: "MO-ROOT",
          colorName: null,
          size: null,
          canonicalSlug: "root",
        },
        {
          supplier: "midocean",
          supplierRef: "MO-ROOT",
          variantId: "variant-1",
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

  it("resuelve ProductVariant.id público y rechaza identidad doble", async () => {
    const row = product("multi", ["MO-ONE", "MO-TWO"]);
    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "multi", variantId: "variant-2" }],
        "midocean",
        lookup({ multi: row }),
      ),
    ).toMatchObject({
      ok: true,
      items: [{ variantId: "variant-2", sku: "MO-TWO" }],
    });
    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "multi", variantId: "variant-2", variantSku: "MO-TWO" }],
        "midocean",
        lookup({ multi: row }),
      ),
    ).toMatchObject({ ok: false, code: "invalid_variant" });
  });

  it("acepta el ID opaco en variantSku durante la transición de API v1", async () => {
    const row = product("multi", ["MO-ONE", "MO-TWO"]);
    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "multi", variantSku: "variant-2" }],
        "midocean",
        lookup({ multi: row }),
      ),
    ).toMatchObject({
      ok: true,
      items: [{ variantId: "variant-2", sku: "MO-TWO" }],
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

    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "root", variantId: "variant-ajena" }],
        "midocean",
        lookup({ root: product("root", []) }),
      ),
    ).toMatchObject({ ok: false, code: "invalid_variant" });
  });

  it("devuelve color y talla canónicos de BD para no confiar en el POST", async () => {
    const row = product("camiseta", ["CAM-AZ-M"]);
    row.product.variants[0] = {
      id: "variant-cam-m",
      sku: "CAM-AZ-M",
      colorName: "AZUL",
      colorGroup: "azul",
      colorHex: null,
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

  it("normaliza metadata Cifra heredada antes de cotizar o pedir", async () => {
    const row = product("runner", ["10866-L-NE"]);
    row.product.supplier = "cifra";
    row.product.supplierRef = "10866";
    row.product.variants[0] = {
      id: "opaque-runner-l",
      sku: "10866-L-NE",
      colorName: "L-NE",
      colorGroup: null,
      colorHex: null,
      size: null,
    };

    expect(
      await resolveSupplierOrderVariants(
        [{ productSlug: "runner", variantId: "opaque-runner-l" }],
        "cifra",
        lookup({ runner: row }),
      ),
    ).toMatchObject({
      ok: true,
      items: [{ sku: "10866-L-NE", colorName: "Negro", size: "L" }],
    });
  });
});
