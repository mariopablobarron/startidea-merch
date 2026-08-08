import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PUBLIC_NAME_SURFACES = [
  ["src/app/catalogo/[slug]/page.tsx", 2],
  ["src/app/catalogo/page.tsx", 2],
  ["src/app/categorias/[slug]/page.tsx", 2],
  ["src/app/promociones/page.tsx", 2],
  ["src/app/comparar/page.tsx", 2],
  ["src/components/BestSellers.tsx", 1],
  ["src/components/RelatedProducts.tsx", 1],
  ["src/app/api/products/cards/route.ts", 1],
  ["src/app/api/search/suggest/route.ts", 2],
  ["src/app/api/v1/products/route.ts", 1],
  ["src/app/api/recommend/route.ts", 2],
  ["src/app/api/promotions/active/route.ts", 1],
  ["src/app/api/search/semantic/route.ts", 1],
  ["src/app/api/quote/calculate/route.ts", 1],
  ["src/app/api/quote-request-product/route.ts", 1],
  ["src/app/api/v1/quotes/route.ts", 1],
  ["src/app/api/voice-agent/tools/product-details/route.ts", 1],
  ["src/app/api/voice-agent/tools/search-products/route.ts", 1],
  ["src/app/api/voice-agent/tools/popular-products/route.ts", 1],
  ["src/app/api/voice-agent/tools/submit-quote/route.ts", 1],
  ["src/app/api/voice-agent/tools/list-promotions/route.ts", 1],
  ["src/app/api/mockup-request/route.ts", 1],
  ["src/lib/cotizar-core.ts", 1],
  ["src/app/clientes/page.tsx", 1],
  ["src/lib/quote-ai-builder.ts", 1],
  ["src/app/api/admin/proposals/generate/route.ts", 1],
] as const;

describe("guard: nombres públicos sin HTML heredado", () => {
  for (const [file, minimumUses] of PUBLIC_NAME_SURFACES) {
    it(`${file} resuelve los nombres con publicProductName`, () => {
      const src = read(file);
      const uses = src.match(/publicProductName\s*\(/g)?.length ?? 0;
      expect(uses, `${file}: faltan salidas públicas protegidas`).toBeGreaterThanOrEqual(
        minimumUses,
      );
      expect(src).not.toMatch(/alt=\{(?:p|product)\.name\}/);
      expect(src).not.toMatch(
        /const\s+(?:displayName|name)\s*=\s*(?:ov|p\.override)\?\.customName\s*\|\|/,
      );
    });
  }

  it("la ficha limpia también metadata, descripciones y material", () => {
    const src = read("src/app/catalogo/[slug]/page.tsx");
    expect(src).toMatch(/const customMetaDescription = legacyHtmlToText/);
    expect(src).toMatch(/const supplierDescription = legacyHtmlToText/);
    expect(src).toMatch(/const displayDescription = legacyHtmlToText/);
    expect(src).toMatch(/const displayMaterial = legacyHtmlToText/);
  });

  it("catálogo, comparador, búsqueda y voz no emiten material legacy", () => {
    expect(read("src/app/catalogo/page.tsx")).toMatch(/groupLegacyHtmlValues\(/);
    expect(read("src/app/catalogo/page.tsx")).toMatch(
      /material: \{ in: selectedMaterialGroup\.values \}/,
    );
    expect(read("src/app/comparar/page.tsx")).toMatch(
      /render: \(p\) => legacyHtmlToText\(p\.material\)/,
    );
    expect(read("src/app/api/voice-agent/tools/product-details/route.ts")).toMatch(
      /material: legacyHtmlToText\(p\.material\)/,
    );
    expect(read("src/app/api/search/semantic/route.ts")).toMatch(
      /description:\s*legacyHtmlToText/,
    );
  });

  it("el documento de Meilisearch no indexa nombre ni descripción crudos", () => {
    const src = read("src/lib/search/meili.ts");
    expect(src).toMatch(/name: normalizeProductName\(p\.name\)/);
    expect(src).toMatch(/shortDescription: legacyHtmlToText\(p\.shortDescription\)/);
  });

  it("el snapshot compartido normaliza nombres agregados", () => {
    expect(read("src/app/share/dashboard/[token]/page.tsx")).toMatch(
      /normalizeProductName\(p\.name\)/,
    );
  });

  it("los carritos públicos no persisten productName arbitrario", () => {
    expect(read("src/app/api/cart-quote/route.ts")).toMatch(
      /productName: normalizeProductName\(it\.productName\)/,
    );
    expect(read("src/lib/cart-item-schema.ts")).toMatch(
      /productName: normalizeProductName\(it\.productName\)/,
    );
    expect(read("src/app/api/cart-quote/save-for-later/route.ts")).toMatch(
      /escapeHtml\(normalizeProductName\(it\.productName\)\)/,
    );
  });
});
