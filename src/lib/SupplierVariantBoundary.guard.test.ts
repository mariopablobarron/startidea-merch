import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guard: SKU exacto antes de pago o pedido a proveedor", () => {
  it("hace preflight antes de crear la sesión Stripe", () => {
    const checkout = source("src/app/api/pay/[token]/checkout/route.ts");
    const preflight = checkout.indexOf("resolveSupplierOrderVariants(cart.items)");
    const stripe = checkout.indexOf("stripe.checkout.sessions.create");

    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(stripe);
    expect(checkout).toContain("{ status: 422 }");
  });

  it("ningún adaptador cae a la referencia pública del carrito", () => {
    const paths = [
      "src/lib/midocean-auto-order.ts",
      "src/lib/makito-auto-order.ts",
      "src/lib/cifra-auto-order.ts",
      "src/app/api/admin/cart-quotes/[id]/place-order/route.ts",
    ];

    for (const path of paths) {
      const code = source(path);
      expect(code, path).toContain("resolveSupplierOrderVariants(");
      expect(code, path).not.toMatch(/variantSku\s*\|\|\s*(?:it\.)?productRef/);
    }
  });

  it("la ruta manual valida antes de reclamar o contactar MidOcean", () => {
    const route = source("src/app/api/admin/cart-quotes/[id]/place-order/route.ts");
    const preflight = route.indexOf("resolveSupplierOrderVariants(cart.items");
    const claim = route.indexOf("claimSupplierOrder(", preflight);
    const externalCall = route.indexOf("midoceanOrders.createOrder", preflight);

    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(claim);
    expect(preflight).toBeLessThan(externalCall);
  });

  it("la solicitud formal valida y persiste la selección en el borrador", () => {
    const route = source("src/app/api/quote-request-product/route.ts");
    const validation = route.indexOf("validateQuoteRequestVariantDistribution(");
    const membership = route.indexOf("resolveSupplierOrderVariants(", validation);
    const quote = route.indexOf("computeCotizacion(", membership);
    const proposal = route.indexOf("createProposalFromCotizacion(", quote);

    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(membership);
    expect(membership).toBeLessThan(quote);
    expect(route.indexOf("variantSelection,", proposal)).toBeGreaterThan(proposal);
    expect(route).toContain("canonicalizeQuoteRequestVariantSelection(");
    expect(route).not.toContain("summary: variantSummary,");
    expect(route).not.toContain("colorName: d.colorName");
    expect(route).not.toContain("size: d.size");
  });

  it("canonicaliza el carrito antes de precio, cupón, escritura o avisos", () => {
    const route = source("src/app/api/cart-quote/route.ts");
    const preflight = route.indexOf("resolveSupplierOrderVariants(");

    expect(preflight).toBeGreaterThan(-1);
    for (const boundary of [
      "computeServerLinePricing(",
      "validateCoupon(",
      "prisma.cartQuote.create(",
      "sendEmail({",
    ]) {
      expect(route.indexOf(boundary, preflight), boundary).toBeGreaterThan(preflight);
    }
    expect(route).toContain("variantSku: canonical.variantId ? canonical.sku : null");
  });

  it("canonicaliza el guardado temprano y actualiza sus líneas en transacción", () => {
    const route = source("src/app/api/cart-quote/save-for-later/route.ts");
    const preflight = route.indexOf("resolveSupplierOrderVariants(");
    const deletion = route.indexOf("cartQuoteItem.deleteMany", preflight);

    expect(preflight).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(preflight);
    expect(route.indexOf("prisma.$transaction(", preflight)).toBeLessThan(deletion);
  });

  it("las respuestas de recuperación nunca reemiten el SKU interno", () => {
    for (const path of [
      "src/app/api/cart-quote/[id]/route.ts",
      "src/app/api/clientes/reorder/route.ts",
    ]) {
      const route = source(path);
      expect(route, path).toContain("resolvePublicVariantReferences(");
      expect(route, path).not.toContain("variantSku: it.variantSku");
    }
  });

  it("el portal de cliente resuelve históricos por producto y no analiza el SKU en pantalla", () => {
    const dashboard = source("src/app/clientes/[token]/page.tsx");

    expect(dashboard).toContain("resolvePublicVariantReferences(");
    expect(dashboard).toContain("productSlug: item.productSlug");
    expect(dashboard).not.toContain("extractSize(");
    expect(dashboard).not.toContain("it.variantSku ?");
  });

  it("la API v1 expone IDs opacos y canonicaliza antes de crear o avisar", () => {
    const products = source("src/app/api/v1/products/route.ts");
    const dto = products.slice(products.indexOf("items: items.map"));
    expect(dto).toContain("variantId: variant.id");
    expect(dto).toContain("sku: variant.id");
    expect(dto).toContain("gtin: storedVariant.gtin");
    expect(dto).not.toContain("sku: storedVariant.sku");
    expect(dto).not.toContain("sku: variant.sku");

    const quotes = source("src/app/api/v1/quotes/route.ts");
    const preflight = quotes.indexOf("resolveSupplierOrderVariants(");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(quotes.indexOf("prisma.cartQuote.create(", preflight));
    expect(preflight).toBeLessThan(quotes.indexOf("notifyAdmins({", preflight));
    expect(quotes).toContain("variantSku: canonical.variantId ? canonical.sku : null");
  });

  it("el sync Cifra usa el parser cerrado en create y update", () => {
    const sync = source("src/lib/suppliers/cifra-sync.ts");

    expect(sync).toContain("parseCifraVariantDimensions(v.model, rootmodel)");
    expect(sync.match(/colorName: sanitizeSupplierText\(dimensions\.colorName\)/g)).toHaveLength(2);
    expect(sync.match(/size: dimensions\.size/g)).toHaveLength(2);
    expect(sync).not.toContain("resolveColor(suffix)");
  });
});
