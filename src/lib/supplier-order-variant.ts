import type { SupplierCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveProductsBySlugs,
  type ResolvedProductSlug,
} from "@/lib/product-slug-resolver";
import { extractSize } from "@/lib/variant-grouping";
import { normalizeLegacyCifraVariant } from "@/lib/suppliers/cifra-variant";

export type SupplierOrderVariantInput = {
  productSlug: string;
  productRef?: string | null;
  variantId?: string | null;
  /** Compatibilidad con CartQuote históricos; no lo envían clientes nuevos. */
  variantSku?: string | null;
};

type SupplierProduct = {
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
};

export type ResolvedSupplierOrderVariant = {
  supplier: SupplierCode;
  supplierRef: string;
  variantId: string | null;
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

    const explicitVariantId = input.variantId?.trim();
    const legacySku = input.variantSku?.trim();
    if (explicitVariantId && legacySku) {
      return {
        ok: false,
        code: "invalid_variant",
        error: `El producto ${resolved.canonicalSlug} recibió dos identidades de variante`,
      };
    }
    let sku: string;
    let canonicalVariant: SupplierProduct["variants"][number] | undefined;
    if (product._count.variants === 0) {
      // Sin catálogo de variantes, la única identidad autorizada es la raíz
      // canónica de proveedor. Ninguna identidad explícita puede sustituirla.
      if (explicitVariantId || legacySku) {
        return {
          ok: false,
          code: "invalid_variant",
          error: `El producto ${resolved.canonicalSlug} no admite variante`,
        };
      }
      sku = product.supplierRef;
    } else if (explicitVariantId || legacySku) {
      canonicalVariant = product.variants.find(
        (variant) =>
          (explicitVariantId ? variant.id === explicitVariantId : false) ||
          (legacySku ? variant.sku === legacySku || variant.id === legacySku : false),
      );
      if (!canonicalVariant) {
        return {
          ok: false,
          code: "invalid_variant",
          error: `La variante indicada no pertenece a ${resolved.canonicalSlug}`,
        };
      }
      sku = canonicalVariant.sku;
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

    const canonicalAttributes =
      canonicalVariant && product.supplier === "cifra"
        ? normalizeLegacyCifraVariant(canonicalVariant, product.supplierRef)
        : canonicalVariant;
    resolvedItems.push({
      supplier: product.supplier,
      supplierRef: product.supplierRef,
      variantId: canonicalVariant?.id ?? null,
      sku,
      colorName: canonicalAttributes?.colorName ?? null,
      size: canonicalAttributes
        ? extractSize({ size: canonicalAttributes.size, sku: canonicalAttributes.sku })
        : null,
      canonicalSlug: resolved.canonicalSlug,
    });
  }

  return { ok: true, items: resolvedItems };
}
