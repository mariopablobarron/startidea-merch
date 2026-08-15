import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/catalogo/[slug]/page.tsx"),
  "utf8",
);

describe("guard: jerarquía de la ficha de producto", () => {
  it("mantiene el DOM en el mismo orden que el recorrido móvil", () => {
    const gallery = pageSource.indexOf('data-product-region="gallery"');
    const purchase = pageSource.indexOf('data-product-region="purchase"');
    const technical = pageSource.indexOf('data-product-region="technical"');
    const h1 = pageSource.indexOf('<h1 id="product-title"');
    const firstH2 = pageSource.indexOf("<h2");
    const form = pageSource.indexOf("<ProductOrderForm", purchase);

    expect(gallery).toBeGreaterThan(-1);
    expect(gallery).toBeLessThan(purchase);
    expect(purchase).toBeLessThan(h1);
    expect(h1).toBeLessThan(form);
    expect(form).toBeLessThan(technical);
    expect(h1).toBeLessThan(firstH2);
    expect(pageSource.match(/<h1\b/g)).toHaveLength(1);

    const productLayout = pageSource.slice(gallery, technical);
    expect(productLayout).not.toContain('className="contents');
    expect(productLayout).not.toMatch(/\border-(?:\d+|first|last|none)\b/);
  });

  it("conserva contexto, favorito y composición desktop", () => {
    const providerStart = pageSource.indexOf("<ProductColorProvider>");
    const providerEnd = pageSource.indexOf("</ProductColorProvider>");
    const gallery = pageSource.indexOf('data-product-region="gallery"');
    const purchase = pageSource.indexOf('data-product-region="purchase"');
    const technical = pageSource.indexOf('data-product-region="technical"');
    const favorite = pageSource.indexOf("<FavoriteHeart", purchase);
    const form = pageSource.indexOf("<ProductOrderForm", purchase);

    expect(providerStart).toBeLessThan(gallery);
    expect(providerEnd).toBeGreaterThan(technical);
    expect(favorite).toBeGreaterThan(pageSource.indexOf('<h1 id="product-title"'));
    expect(favorite).toBeLessThan(form);
    expect(pageSource.match(/<FavoriteHeart\b/g)).toHaveLength(1);

    expect(pageSource).toContain(
      "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]",
    );
    expect(pageSource).toContain("lg:col-start-1 lg:row-start-1");
    expect(pageSource).toContain(
      "lg:col-start-2 lg:row-span-2 lg:row-start-1",
    );
    expect(pageSource).toContain("lg:col-start-1 lg:row-start-2");
    expect(pageSource).toContain('aria-labelledby="product-title"');
  });
});
