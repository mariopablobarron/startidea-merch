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
const RAW_EMIT = /:\s*[\w.!]+\.(primaryImageUrl|imageUrl)\b/g;
const SAFE = /proxyImageUrl|ensureMediaAsset/;

/**
 * ⚠️ Se barre el fichero con los SALTOS DE LÍNEA COLAPSADOS, no línea a línea.
 *
 * No es cosmético: hasta el 2026-08-10 este guard comparaba línea a línea y
 * una fuga partida en dos —que es exactamente lo que produce el formateador
 * cuando la línea se pasa de ancho— se le escapaba ENTERA:
 *
 *     imageUrl:
 *       producto.primaryImageUrl,
 *
 * Ninguna de las dos líneas casaba por separado (la primera no tiene el campo,
 * la segunda no tiene los dos puntos), así que el guard daba verde. Es la
 * misma lección que ya documentó `secreto-sin-fallback-literal.guard`, cuyos
 * tres casos reales venían repartidos en varias líneas; aquí no se había
 * aplicado.
 *
 * Al colapsar hace falta conservar la LOCALIDAD: si se buscara `proxyImageUrl`
 * en todo el fichero, bastaría con que la ruta lo usara UNA vez en cualquier
 * sitio para que quedaran perdonadas todas las demás emisiones. Por eso la
 * envoltura se busca en una ventana alrededor de cada coincidencia.
 */
const VENTANA = 90;

function emisionesCrudas(codigo: string): string[] {
  const plano = codigo.replace(/\s+/g, " ");
  const fuera: string[] = [];
  for (const m of plano.matchAll(RAW_EMIT)) {
    const desde = Math.max(0, (m.index ?? 0) - VENTANA);
    const hasta = (m.index ?? 0) + m[0].length + VENTANA;
    if (!SAFE.test(plano.slice(desde, hasta))) fuera.push(m[0].trim());
  }
  return fuera;
}

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
    const offenders = emisionesCrudas(readFileSync(join(process.cwd(), file), "utf8"));
    expect(
      offenders,
      `${file} emite un campo de imagen crudo (envuélvelo en proxyImageUrl): ` +
        offenders.join(" · "),
    ).toEqual([]);
  });

  describe("🔬 anti-falso-verde — el guard caza lo que debe y no marca lo que no", () => {
    it.each([
      ["fuga en una línea", "imageUrl: p.primaryImageUrl,"],
      ["fuga PARTIDA en dos líneas", "imageUrl:\n      p.primaryImageUrl,"],
      ["fuga partida con línea en blanco", "imageUrl:\n\n      p.primaryImageUrl,"],
      ["fuga con non-null assertion", "primaryImageUrl:\n   producto!.primaryImageUrl,"],
    ])("CAZA %s", (_caso, codigo) => {
      expect(emisionesCrudas(codigo)).not.toEqual([]);
    });

    it.each([
      ["envuelta en una línea", "imageUrl: proxyImageUrl(p.primaryImageUrl),"],
      ["envuelta PARTIDA en varias líneas", "imageUrl: proxyImageUrl(\n   p.primaryImageUrl,\n ),"],
      [
        "ternario con la envoltura en otra línea",
        "imageUrl: p.primaryImageUrl\n  ? proxyImageUrl(p.primaryImageUrl)\n  : null,",
      ],
      ["ensureMediaAsset partido", "imageUrl: await ensureMediaAsset(\n   p.primaryImageUrl),"],
      ["select de Prisma", "primaryImageUrl: true,"],
      ["esquema zod", "imageUrl: z.string().url(),"],
    ])("NO marca %s", (_caso, codigo) => {
      expect(emisionesCrudas(codigo)).toEqual([]);
    });

    it("🔒 la envoltura NO se acepta desde el otro extremo del fichero", () => {
      // Si se buscara `proxyImageUrl` en todo el fichero en vez de en una
      // ventana, una sola aparición lejana perdonaría todas las emisiones.
      const lejos = `const a = proxyImageUrl(x);\n${"const relleno = 1;\n".repeat(40)}imageUrl: p.primaryImageUrl,`;
      expect(emisionesCrudas(lejos)).not.toEqual([]);
    });
  });
});
