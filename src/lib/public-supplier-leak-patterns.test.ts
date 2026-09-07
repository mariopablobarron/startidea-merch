import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PUBLIC_SUPPLIER_LEAK_PATTERNS } from "./public-supplier-leak-patterns";

function codesFor(value: string) {
  return PUBLIC_SUPPLIER_LEAK_PATTERNS
    .filter(({ re }) => {
      re.lastIndex = 0;
      return re.test(value);
    })
    .map(({ code }) => code);
}

describe("canarios públicos anti-SKU", () => {
  it.each([
    ['{"primarySku":"AR1249-16"}', "legacy-rsc-variant-key"],
    ['{\\"primarySku\\":\\"AR1249-16\\"}', "legacy-rsc-variant-key"],
    ['{\\"variantSku\\":\\"11064\\"}', "legacy-rsc-variant-key"],
    ['{\\"sku\\":\\"11064\\"}', "rsc-sku-key"],
    ['{\\"sku\\":\\"10866-L-NE\\"}', "rsc-sku-key"],
  ])("detecta el fixture RSC %s", (fixture, code) => {
    expect(codesFor(fixture)).toContain(code);
  });

  it("permite el sku público STM-* de JSON-LD no escapado", () => {
    expect(codesFor('{"sku":"STM-MGSHMW"}')).toEqual([]);
    expect(codesFor('{\\"sku\\":\\"STM-MGSHMW\\",\\"mpn\\":\\"STM-MGSHMW\\"}')).toEqual([]);
  });

  it("mantiene el patrón shell equivalente y ejecutable", () => {
    const deploy = readFileSync(join(process.cwd(), "scripts/deploy.sh"), "utf8");
    const pattern = deploy.match(/AUDIT_PATTERN='([^']+)'/)?.[1];
    const publicSkuSed = deploy.match(/AUDIT_PUBLIC_SKU_SED='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    expect(publicSkuSed).toBeTruthy();
    const shellLeaks = (input: string) => {
      const sanitized = spawnSync("sed", ["-E", publicSkuSed!], { input });
      expect(sanitized.status).toBe(0);
      return spawnSync("grep", ["-Eiq", pattern!], {
        input: sanitized.stdout,
      }).status === 0;
    };
    expect(
      shellLeaks('{\\"primarySku\\":\\"11064\\"}'),
    ).toBe(true);
    expect(
      shellLeaks('{\\"sku\\":\\"11064\\"}'),
    ).toBe(true);
    expect(
      shellLeaks('{"sku":"STM-MGSHMW"}'),
    ).toBe(false);
    expect(
      shellLeaks('{\\"sku\\":\\"STM-MGSHMW\\",\\"mpn\\":\\"STM-MGSHMW\\"}'),
    ).toBe(false);
  });
});

/**
 * El audit del deploy tiene un SEGUNDO canario desde el 07-sep-2026: el
 * argumentario mayorista. El primero vigila identificadores de proveedor y por
 * eso dio OK el 06-sep a las 23:28 mientras 59 fichas ACTIVAS publicaban
 * «Exclusivamente para Rotulistas y Distribuidores … 【30% de margen】».
 *
 * Este bloque prueba el patrón shell REAL leído de scripts/deploy.sh —no una
 * copia— por mutación: tiene que cazar la frase del proveedor y tiene que
 * dejar pasar el castellano legítimo del comercio.
 */
describe("canario público anti-argumentario mayorista", () => {
  const deploy = readFileSync(join(process.cwd(), "scripts/deploy.sh"), "utf8");
  const pattern = deploy.match(/AUDIT_WHOLESALE_PATTERN='([^']+)'/)?.[1];

  const shellLeaks = (input: string) =>
    spawnSync("grep", ["-Eiq", pattern!], { input }).status === 0;

  it("el patrón sigue existiendo en scripts/deploy.sh", () => {
    expect(pattern).toBeTruthy();
  });

  it.each([
    "✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online",
    // 07-sep-2026: la MISMA fuga sin el adverbio, viva en seis fichas ACTIVAS
    // mientras este canario —que exigía «exclusivamente»— daba OK.
    "Pack Fly Banner Surf ✓ Exclusivo para Distribuidores ✓ 100% Online",
    "Mástiles Institucionales ✓ Exclusivos para Distribuidores ✓ 100% Online",
    "Lona ✓ Exclusivas para mayoristas ✓ 100% Online",
    "Fabricación y entrega en 24h【30% de margen】Envío gratis.",
    "producto exclusivamente para distribuidores del sector",
    "deja un margen comercial interesante",
    "30 % de margen para el revendedor",
  ])("caza la frase mayorista %s", (fixture) => {
    expect(shellLeaks(fixture)).toBe(true);
  });

  it.each([
    "Bolígrafo de aluminio con clip metálico y tinta azul.",
    "Carpa plegable 3x3 m con estructura de acero.",
    "Margen de personalización: 2 cm alrededor del logotipo.",
    "Envío gratis a partir de 300 € y entrega en 24 h.",
    "Estuche exclusivo para amantes del vino con sacacorchos.",
    "Soporte exclusivo para su publicidad en ferias.",
  ])("deja pasar el texto legítimo %s", (fixture) => {
    expect(shellLeaks(fixture)).toBe(false);
  });

  it("las fichas afectadas están entre las rutas auditadas", () => {
    // Sin esto el patrón sería correcto y el audit seguiría sin mirar donde
    // pasó: las 8 rutas originales eran todas de otros proveedores.
    expect(deploy).toContain('"/catalogo/pared-completa-a-doble-cara-3x19m"');
    // Y dos de las seis de la variante sin adverbio: las tres rutas de Ádivin
    // añadidas el 07-sep por la mañana llevaban todas «Exclusivamente», así
    // que tampoco habrían visto esta.
    expect(deploy).toContain('"/catalogo/fly-banner-surf-pack-completo"');
  });
});
