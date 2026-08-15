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
});
