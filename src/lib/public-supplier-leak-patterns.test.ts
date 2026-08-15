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
