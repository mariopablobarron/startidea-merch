import type { SupplierCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveProductsBySlugs,
  type ResolvedProductSlug,
} from "@/lib/product-slug-resolver";
import { extractSize } from "@/lib/variant-grouping";

export type SupplierOrderVariantInput = {
  productSlug: string;
  productRef?: string | null;
  variantSku?: string | null;
};

type SupplierProduct = {
  slug: string;
  supplier: SupplierCode;
  supplierRef: string;
  _count: { variants: number };
  variants: Array<{ sku: string; colorName: string | null; size: string | null }>;
};

export type ResolvedSupplierOrderVariant = {
  supplier: SupplierCode;
  supplierRef: string;
  sku: string;
  colorName: string | null;
  size: string | null;
  canonicalSlug: string;
};

export type SupplierOrderVariantErrorCode =
  | "unknown_product"
  | "supplier_mismatch"
  | "invalid_variant"
  | "variant_required";

export type SupplierOrderVariantResult =
  | { ok: true; items: ResolvedSupplierOrderVariant[] }
  | { ok: false; code: SupplierOrderVariantErrorCode; error: string };

type ProductLookup = (
  slugs: ReadonlyArray<string>,
) => Promise<Map<string, ResolvedProductSlug<SupplierProduct>>>;

async function lookupProducts(slugs: ReadonlyArray<string>) {
  return resolveProductsBySlugs(slugs, (candidateSlugs) =>
    prisma.product.findMany({
      where: { slug: { in: [...candidateSlugs] } },
      select: {
        slug: true,
        supplier: true,
        supplierRef: true,
        _count: { select: { variants: true } },
        variants: { select: { sku: true, colorName: true, size: true } },
      },
    }),
  );
}

/**
 * Convierte la identidad pública de carrito en referencias de proveedor.
 * `productRef` es STM-* y NUNCA se usa como fallback de pedido.
 *
 * Un SKU ausente solo se puede reconstruir si el producto tiene cero
 * variantes (supplierRef raíz) o exactamente una variante. Con dos o más se
 * corta antes de cobrar, notificar o contactar al proveedor.
 */
export async function resolveSupplierOrderVariants(
  inputs: ReadonlyArray<SupplierOrderVariantInput>,
  expectedSupplier?: SupplierCode,
  lookup: ProductLookup = lookupProducts,
): Promise<SupplierOrderVariantResult> {
  const products = await lookup(inputs.map((input) => input.productSlug));
  const resolvedItems: ResolvedSupplierOrderVariant[] = [];

  for (const input of inputs) {
    const resolved = products.get(input.productSlug);
    if (!resolved) {
      return {
        ok: false,
        code: "unknown_product",
        error: `Producto no resoluble: ${input.productSlug}`,
      };
    }

    const product = resolved.product;
    if (expectedSupplier && product.supplier !== expectedSupplier) {
      return {
        ok: false,
        code: "supplier_mismatch",
        error: `El producto ${resolved.canonicalSlug} no pertenece a ${expectedSupplier}`,
      };
    }

    const explicitSku = input.variantSku?.trim();
    let sku: string;
    let canonicalVariant: SupplierProduct["variants"][number] | undefined;
    if (product._count.variants === 0) {
      // Sin catálogo de variantes, la única identidad autorizada es la raíz
      // canónica de proveedor. Un SKU del navegador no puede sustituirla.
      sku = product.supplierRef;
    } else if (explicitSku) {
      canonicalVariant = product.variants.find(
        (variant) => variant.sku === explicitSku,
      );
      if (!canonicalVariant) {
        return {
          ok: false,
          code: "invalid_variant",
          error: `La variante ${explicitSku} no pertenece a ${resolved.canonicalSlug}`,
        };
      }
      sku = explicitSku;
    } else if (product._count.variants === 1 && product.variants[0]?.sku) {
      canonicalVariant = product.variants[0];
      sku = canonicalVariant.sku;
    } else {
      return {
        ok: false,
        code: "variant_required",
        error: `El producto ${resolved.canonicalSlug} necesita una variante exacta`,
      };
    }

    resolvedItems.push({
      supplier: product.supplier,
      supplierRef: product.supplierRef,
      sku,
      colorName: canonicalVariant?.colorName ?? null,
      size: canonicalVariant
        ? extractSize({ size: canonicalVariant.size, sku: canonicalVariant.sku })
        : null,
      canonicalSlug: resolved.canonicalSlug,
    });
  }

  return { ok: true, items: resolvedItems };
}
