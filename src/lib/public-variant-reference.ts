import { prisma } from "@/lib/prisma";
import type { SupplierCode } from "@prisma/client";
import { resolveProductsBySlugs, type ResolvedProductSlug } from "@/lib/product-slug-resolver";
import { normalizeLegacyCifraVariant } from "@/lib/suppliers/cifra-variant";
import { extractSize } from "@/lib/variant-grouping";

type PublicVariantProduct = {
  slug: string;
  supplier: SupplierCode;
  supplierRef: string;
  variants: Array<{
    id: string;
    sku: string;
    colorName: string | null;
    colorGroup: string | null;
    colorHex: string | null;
    size: string | null;
  }>;
};

type ProductLookup = (
  slugs: ReadonlyArray<string>,
) => Promise<Map<string, ResolvedProductSlug<PublicVariantProduct>>>;

export type StoredVariantReference = {
  productSlug: string;
  variantSku?: string | null;
};

export type PublicVariantReference = {
  variantId: string | null;
  colorName: string | null;
  size: string | null;
  requiresVariantReview: boolean;
};

async function lookupProducts(slugs: ReadonlyArray<string>) {
  return resolveProductsBySlugs(slugs, (candidateSlugs) =>
    prisma.product.findMany({
      where: { slug: { in: [...candidateSlugs] } },
      select: {
        slug: true,
        supplier: true,
        supplierRef: true,
        variants: {
          select: {
            id: true,
            sku: true,
            colorName: true,
            colorGroup: true,
            colorHex: true,
            size: true,
          },
        },
      },
    }),
  );
}

/** Convierte SKU internos/históricos a ProductVariant.id antes de responder. */
export async function resolvePublicVariantReferences(
  inputs: ReadonlyArray<StoredVariantReference>,
  lookup: ProductLookup = lookupProducts,
): Promise<PublicVariantReference[]> {
  const products = await lookup(inputs.map((input) => input.productSlug));
  return inputs.map((input) => {
    const resolved = products.get(input.productSlug);
    if (!resolved) {
      return { variantId: null, colorName: null, size: null, requiresVariantReview: true };
    }
    const product = resolved.product;
    const stored = input.variantSku?.trim() || null;
    const variant = stored
      ? product.variants.find((candidate) => candidate.sku === stored || candidate.id === stored)
      : product.variants.length === 1
        ? product.variants[0]
        : undefined;
    if (!variant) {
      return {
        variantId: null,
        colorName: null,
        size: null,
        requiresVariantReview: product.variants.length > 0 || stored !== null,
      };
    }
    const attributes =
      product.supplier === "cifra"
        ? normalizeLegacyCifraVariant(variant, product.supplierRef)
        : variant;
    return {
      variantId: variant.id,
      colorName: attributes.colorName,
      size: extractSize({ size: attributes.size, sku: attributes.sku }),
      requiresVariantReview: false,
    };
  });
}
