import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD estático anti-fuga de proveedor en imágenes.
 *
 * La fuga del 2026-07-20 (ver incident_midocean_image_leak) ocurrió porque
 * `/api/recommend` emitía `primaryImageUrl` CRUDO de BD. Ese mismo patrón
 * estaba latente en varias rutas más (v1/products, search/*, cart-quote…):
 * solo estaban limpias porque la BD estaba limpia.
 *
 * Regla que este test IMPONE en CI, antes de desplegar:
 *   Ninguna ruta de cara al cliente (todo /api/ salvo /admin/ y /cron/) puede
 *   emitir/almacenar un campo de imagen (`X.primaryImageUrl` / `X.imageUrl`)
 *   sin pasarlo por `proxyImageUrl()` o `ensureMediaAsset()`.
 *
 * Si añades una ruta nueva que devuelve imágenes de producto: envuélvela en
 * `proxyImageUrl(...)`. No añadas excepciones aquí sin una razón muy clara.
 */

// Emisión de valor: `algo: <ident>.(primaryImageUrl|imageUrl)` — requiere un
// acceso por punto (X.campo), lo que descarta `primaryImageUrl: true` (select),
// `primaryImageUrl: z.string()` (zod) y anotaciones de tipo.
const RAW_EMIT = /:\s*[\w.!]+\.(primaryImageUrl|imageUrl)\b/;
const SAFE = /proxyImageUrl|ensureMediaAsset/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === "route.ts") acc.push(full);
  }
  return acc;
}

function publicRouteFiles(): string[] {
  const base = join(process.cwd(), "src/app/api");
  return walk(base)
    .map((f) => f.slice(process.cwd().length + 1))
    .filter((f) => !f.includes("/admin/") && !f.includes("/cron/"));
}

describe("guard: ninguna ruta pública emite URL de imagen cruda de proveedor", () => {
  const files = publicRouteFiles();

  it("hay rutas públicas que auditar (el recorrido funciona)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s no emite X.primaryImageUrl/imageUrl sin proxyImageUrl", (file) => {
    const lines = readFileSync(join(process.cwd(), file), "utf8").split("\n");
    const offenders = lines
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => RAW_EMIT.test(line) && !SAFE.test(line));
    expect(
      offenders,
      `${file} emite un campo de imagen crudo (envuélvelo en proxyImageUrl): ` +
        offenders.map((o) => `L${o.n}: ${o.line}`).join(" · "),
    ).toEqual([]);
  });
});
