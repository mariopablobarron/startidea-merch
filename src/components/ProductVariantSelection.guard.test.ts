import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guard: variante exacta antes de añadir al carrito", () => {
  it("bloquea tracking y carrito hasta elegir color o talla", () => {
    const form = source("src/components/ProductOrderForm.tsx");
    const addHandler = form.indexOf("function onAddToCart");
    const variantGuard = form.indexOf("if (addRequirement)", addHandler);
    const tracking = form.indexOf('type: "addToCart"', addHandler);
    const addItem = form.indexOf("addItem({", addHandler);

    expect(variantGuard).toBeGreaterThan(addHandler);
    expect(variantGuard).toBeLessThan(tracking);
    expect(variantGuard).toBeLessThan(addItem);
    expect(form).toContain("resolveOrderVariantSelection(");
    expect(form).toContain("variantSku: orderVariant?.sku ?? null");
    expect(form).toContain("{addRequirement ??");
    expect(form).toContain('role="alert"');
  });

  it("devuelve foco al selector concreto de la galería", () => {
    const form = source("src/components/ProductOrderForm.tsx");
    const gallery = source("src/components/ProductGallery.tsx");

    expect(gallery).toContain("data-color-option");
    expect(gallery).toContain("data-size-option");
    expect(form).toContain('`${scope}${selector}:not(:disabled)`');
    expect(form).toContain('variantControl?.scrollIntoView({ block: "center" })');
    expect(form).toContain("variantControl?.focus({ preventScroll: true })");
    expect(form).toContain('id="product-variant-required"');
    expect(form).toContain('aria-describedby={addRequirement ? "product-variant-required" : undefined}');
  });

  it("conserva variantes sin color y guía la matriz vacía", () => {
    const page = source("src/app/catalogo/[slug]/page.tsx");
    const form = source("src/components/ProductOrderForm.tsx");
    const gallery = source("src/components/ProductGallery.tsx");

    expect(page).toContain("groupColorOptions(product.variants)");
    expect(page).not.toContain("product.variants.filter((v) => v.colorName)");
    expect(gallery).not.toContain("defaultSize");
    expect(form).toContain("data-matrix-quantity");
    expect(form).toContain('addRequirement === "Indica cantidades"');
    expect(form).toContain('"[data-matrix-quantity]"');
    expect(form).toContain("if (addRequirement)");
    expect(form).toContain("currentVariantQuantityLines(matrixSizes, sizesQty)");
    expect(form).toContain("variantLines: currentVariantLines.map");
    expect(form).toContain("if (matrixActive && matrixTotal === 0)");
    expect(form.match(/focusVariantRequirement\("Indica cantidades"\)/g)).toHaveLength(2);
    expect(form).toContain("? matrixTotal");
  });
});
