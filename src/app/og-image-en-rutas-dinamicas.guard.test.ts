import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: ninguna ruta dinámica se sirve sin imagen social.
 *
 * Medido en producción el 25-ago-2026: las 501 landings de `/categorias/[slug]`
 * salían SIN `og:image`, mientras que /faq, /sobre o /blog sí heredaban la del
 * fichero raíz `src/app/opengraph-image.tsx`. La herencia funciona en las
 * páginas estáticas y no llegaba a esa ruta dinámica, así que la regla del
 * repo — que /catalogo, /blog y /sectores ya cumplían sin escribirla — es:
 *
 *   una página en un segmento dinámico o declara `images` en su `openGraph`,
 *   o tiene su propio `opengraph-image.*` en la carpeta del segmento.
 *
 * No es una lista blanca de las rutas de hoy: recorre `src/app` entero, así que
 * una ruta dinámica nueva que se olvide de la imagen falla aquí y no en un
 * barrido manual meses después.
 */

const APP_DIR = join(process.cwd(), "src/app");

type DynamicPage = {
  /** ruta del fichero relativa al repo, para que el fallo diga dónde mirar */
  file: string;
  /** carpeta del segmento dinámico más cercano hacia arriba */
  segmentDir: string;
  source: string;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Carpeta del segmento dinámico (`[slug]`) que contiene a este fichero. */
function nearestDynamicSegment(file: string): string | null {
  const parts = relative(APP_DIR, file).split("/");
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i].startsWith("[")) return join(APP_DIR, ...parts.slice(0, i + 1));
  }
  return null;
}

/**
 * ¿La página declara `images` DENTRO de su bloque `openGraph`?
 *
 * Recorta el bloque contando llaves en vez de mirar una ventana de caracteres:
 * la primera versión de este guard usaba una ventana y se comía el `images:`
 * del bloque `twitter` que viene justo detrás — con lo que daba por buena una
 * página cuyo `openGraph` no tenía imagen. La mutación de prueba lo destapó.
 */
export function declaresOwnImages(source: string): boolean {
  const key = source.indexOf("openGraph:");
  if (key === -1) return false;
  const open = source.indexOf("{", key);
  if (open === -1) return false;

  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return false;

  return /\bimages\s*:/.test(source.slice(open, end));
}

function hasImageFile(segmentDir: string): boolean {
  try {
    return readdirSync(segmentDir).some((f) => f.startsWith("opengraph-image"));
  } catch {
    return false;
  }
}

const dynamicPages: DynamicPage[] = walk(APP_DIR)
  .filter((f) => /\/page\.tsx$/.test(f))
  .filter((f) => /\bopenGraph\s*:/.test(readFileSync(f, "utf8")))
  .map((f) => ({ file: relative(process.cwd(), f), segmentDir: nearestDynamicSegment(f) ?? "", source: readFileSync(f, "utf8") }))
  .filter((p) => p.segmentDir !== "");

describe("guard: og:image en rutas dinámicas", () => {
  it("descubre de verdad las rutas dinámicas con metadatos sociales", () => {
    // Sin cobertura, el guard de abajo pasaría verde sobre una lista vacía.
    expect(dynamicPages.length).toBeGreaterThanOrEqual(3);
    const files = dynamicPages.map((p) => p.file);
    expect(files.some((f) => f.includes("catalogo"))).toBe(true);
    expect(files.some((f) => f.includes("categorias"))).toBe(true);
  });

  it("ninguna se queda sin imagen social", () => {
    const sinImagen = dynamicPages
      .filter((p) => !declaresOwnImages(p.source) && !hasImageFile(p.segmentDir))
      .map((p) => p.file);

    expect(sinImagen).toEqual([]);
  });

  it("el detector distingue de verdad quién declara imágenes", () => {
    // Un detector roto (que devolviera siempre true) dejaría pasar cualquier
    // página: se prueba contra fuentes sintéticas antes de fiarse de él.
    const conImagenes = `export const metadata = { openGraph: { type: "website", title: "x", images: [{ url: "/og" }] } };`;
    const sinImagenes = `export const metadata = { openGraph: { type: "website", title: "x", locale: "es_ES" } };`;
    const imagesFueraDeOg = `export const metadata = { other: { images: ["/og"] } };`;
    // El caso que tumbó a la primera versión del detector: el `images` está en
    // el bloque de al lado, no en el de Open Graph.
    const imagesSoloEnTwitter = `export const metadata = { openGraph: { type: "website", title: "x" }, twitter: { card: "summary_large_image", images: ["/og"] } };`;
    const ogAnidado = `export const metadata = { openGraph: { title: "x", other: { nested: { a: 1 } }, images: [{ url: "/og" }] } };`;

    expect(declaresOwnImages(conImagenes)).toBe(true);
    expect(declaresOwnImages(sinImagenes)).toBe(false);
    expect(declaresOwnImages(imagesFueraDeOg)).toBe(false);
    expect(declaresOwnImages(imagesSoloEnTwitter)).toBe(false);
    expect(declaresOwnImages(ogAnidado)).toBe(true);
  });
});
