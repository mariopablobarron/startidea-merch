/**
 * Guard POR DESCUBRIMIENTO del catálogo de APIs públicas.
 *
 * Recorre `src/app/api` entero y exige que cada ruta pública con `GET` esté
 * decidida en `public-api-surfaces.ts`: o se barre en vivo, o se excluye con
 * un motivo escrito. Una lista blanca solo prueba que no ha vuelto lo viejo;
 * esto suspende cuando aparece algo NUEVO sin mirar, que es el caso que ha
 * mordido a este proyecto (las tres páginas de `/recursos` sirvieron 26
 * menciones de proveedor en abierto sin estar en ninguna lista).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  API_NO_PUBLICAS,
  PUBLIC_API_BARRIDAS,
  PUBLIC_API_EXCLUIDAS,
  rutaApiDesdeFichero,
  urlDeBarrido,
} from "./public-api-surfaces";

const RAIZ = process.cwd();

function ficherosDeRuta(dir = "src/app/api", acc: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) ficherosDeRuta(rel, acc);
    else if (e.name === "route.ts") acc.push(rel);
  }
  return acc;
}

/** Solo las que un navegador puede pedir sin más: `GET`, estáticas y públicas. */
function apisPublicasConGet(): string[] {
  const rutas: string[] = [];
  for (const rel of ficherosDeRuta()) {
    const ruta = rutaApiDesdeFichero(rel);
    if (ruta === null) continue;
    if (API_NO_PUBLICAS.some((p) => `${ruta}/`.startsWith(p))) continue;
    const src = readFileSync(join(RAIZ, rel), "utf8");
    if (!/export\s+(async\s+)?function\s+GET\b/.test(src) && !/export\s+const\s+GET\b/.test(src)) continue;
    rutas.push(ruta);
  }
  return rutas.sort();
}

describe("catálogo de APIs públicas", () => {
  it("toda API pública con GET está barrida o excluida con motivo", () => {
    const declaradas = new Set([
      ...PUBLIC_API_BARRIDAS.map((a) => a.ruta),
      ...PUBLIC_API_EXCLUIDAS.map((a) => a.ruta),
    ]);
    const sinDecidir = apisPublicasConGet().filter((r) => !declaradas.has(r));
    expect(
      sinDecidir,
      `API(s) pública(s) nueva(s) sin decidir en src/lib/public-api-surfaces.ts: ${sinDecidir.join(", ")}. ` +
        "Añádela a PUBLIC_API_BARRIDAS (con la consulta que hace que devuelva datos) o a PUBLIC_API_EXCLUIDAS con el motivo.",
    ).toEqual([]);
  });

  it("no se declara nada que ya no exista", () => {
    const vivas = new Set(apisPublicasConGet());
    const fantasmas = [...PUBLIC_API_BARRIDAS, ...PUBLIC_API_EXCLUIDAS]
      .map((a) => a.ruta)
      .filter((r) => !vivas.has(r));
    expect(fantasmas, `declaradas pero ya no existen: ${fantasmas.join(", ")}`).toEqual([]);
  });

  it("ninguna ruta está a la vez barrida y excluida", () => {
    const excluidas = new Set(PUBLIC_API_EXCLUIDAS.map((a) => a.ruta));
    const dobles = PUBLIC_API_BARRIDAS.map((a) => a.ruta).filter((r) => excluidas.has(r));
    expect(dobles).toEqual([]);
  });

  it("cada exclusión trae un motivo de verdad, no un hueco", () => {
    for (const e of PUBLIC_API_EXCLUIDAS) expect(e.motivo.trim().length, e.ruta).toBeGreaterThan(20);
  });
});

describe("rutaApiDesdeFichero", () => {
  it("convierte el fichero en la ruta que se pide", () => {
    expect(rutaApiDesdeFichero("src/app/api/products/cards/route.ts")).toBe("/api/products/cards");
  });

  it("descarta las dinámicas: no se pueden pedir sin un valor", () => {
    expect(rutaApiDesdeFichero("src/app/api/m/[hash]/route.ts")).toBeNull();
  });
});

describe("urlDeBarrido", () => {
  it("sustituye el slug del día en la consulta", () => {
    expect(urlDeBarrido({ ruta: "/api/products/cards", query: "slugs={slug}", porQue: "" }, "boligrafo-x")).toBe(
      "/api/products/cards?slugs=boligrafo-x",
    );
  });

  it("sin slug disponible deja la consulta vacía en vez de pedir literalmente '{slug}'", () => {
    expect(urlDeBarrido({ ruta: "/api/products/cards", query: "slugs={slug}", porQue: "" }, null)).toBe(
      "/api/products/cards?slugs=",
    );
  });

  it("la superficie sin consulta se pide tal cual", () => {
    expect(urlDeBarrido({ ruta: "/api/impact", porQue: "" }, "boligrafo-x")).toBe("/api/impact");
  });
});

/**
 * El escáner nació para HTML. Barrer APIs solo sirve si caza el identificador
 * dentro de un cuerpo JSON — que es la forma exacta que tenía la fuga de
 * MidOcean del 2026-07-20: `primaryImageUrl` con el CDN del proveedor dentro
 * de la respuesta de una API. Sin esto, el barrido nuevo sería decorado.
 */
describe("el escáner caza la fuga dentro de un cuerpo JSON", () => {
  it("una respuesta de API con el CDN del proveedor no pasa por limpia", async () => {
    const { scanHtmlForLeaks } = await import("./public-leak-scan");
    const cuerpo = JSON.stringify({
      items: [{ slug: "botella-x", image: "https://cdn1.midocean.com/imagen.jpg", ref: "STM-AB12CD" }],
    });
    expect(scanHtmlForLeaks(cuerpo).length).toBeGreaterThan(0);
  });

  it("la respuesta que hoy sirve producción sigue estando limpia", async () => {
    const { scanHtmlForLeaks } = await import("./public-leak-scan");
    const cuerpo = JSON.stringify({
      items: [{ slug: "botella-x", image: "/api/m/MHT94VEX2UEMVKTS", ref: "STM-BJ8FFS" }],
    });
    expect(scanHtmlForLeaks(cuerpo)).toEqual([]);
  });
});
