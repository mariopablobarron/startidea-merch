import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: ninguna página anuncia a las redes una URL que no
 * es la suya.
 *
 * Medido en producción el 25-ago-2026: de 12 páginas comprobadas, 10 servían
 * `og:url = https://merchandising.startidea.es` — la home — mientras su
 * `canonical` sí apuntaba a la página correcta. Compartir /catalogo, /sectores
 * o /recursos en LinkedIn o WhatsApp daba una tarjeta que llevaba a la home, y
 * las señales sociales se consolidaban ahí en vez de en la página compartida.
 *
 * La causa era la herencia: el layout raíz declaraba `openGraph.url` fija, y
 * Next la hereda literalmente en toda página que no la sobrescriba. Es el mismo
 * error que ya se había corregido con `alternates.canonical` global (su
 * comentario sigue en `layout.tsx`), repetido en el campo de al lado.
 *
 * La regla del repo, que /faq y /recomendador ya cumplían sin escribirla:
 *
 *   toda página que declara su propio `alternates.canonical` declara también
 *   un `openGraph.url` propio, o pasa por `mergeMetadata`, que lo deriva del
 *   canonical.
 *
 * No es una lista blanca de las páginas de hoy: recorre `src/app` entero, así
 * que una página nueva que se olvide falla aquí y no en un barrido manual.
 */

const APP_DIR = join(process.cwd(), "src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Recorta el bloque `{...}` que sigue a una clave, contando llaves.
 *
 * Contar llaves y no mirar una ventana de caracteres es deliberado: el guard
 * hermano (`og-image-en-rutas-dinamicas`) usó una ventana en su primera versión
 * y se comía el bloque `twitter` de al lado, dando por buena la página que
 * vigilaba.
 */
export function blockAfter(source: string, key: string): string | null {
  const at = source.indexOf(key);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i);
    }
  }
  return null;
}

/** ¿Declara un `url:` DENTRO de su propio bloque `openGraph`? */
export function declaresOwnOgUrl(source: string): boolean {
  const block = blockAfter(source, "openGraph:");
  if (block === null) return false;
  // Solo el `url` de primer nivel del bloque: el de `images: [{ url }]` es la
  // dirección de la imagen, no la de la página, y aceptarlo daría por buena una
  // página cuya tarjeta sigue apuntando a la home.
  const sinAnidados = block.replace(/\{[^{}]*\}/g, "{}");
  // `url:` y también la propiedad abreviada `url,` — que es como la declara
  // /categorias/[slug]. La primera versión de este detector solo miraba `url:`
  // y por eso denunciaba como infractora una página que sí la declaraba.
  return /(^|[{,\s])url\s*([:,}]|$)/.test(sinAnidados);
}

/** ¿Declara su propio canonical? (el layout raíz ya no declara ninguno) */
function declaresCanonical(source: string): boolean {
  return /\bcanonical\s*:/.test(source);
}

const paginas = walk(APP_DIR)
  .filter((f) => /\/page\.tsx$/.test(f))
  .map((f) => ({ file: relative(process.cwd(), f), source: readFileSync(f, "utf8") }))
  .filter((p) => declaresCanonical(p.source));

describe("guard: og:url coherente con el canonical", () => {
  it("descubre de verdad las páginas con canonical propio", () => {
    // Sin cobertura, el guard de abajo pasaría verde sobre una lista vacía.
    expect(paginas.length).toBeGreaterThanOrEqual(20);
    const files = paginas.map((p) => p.file);
    expect(files.some((f) => f.endsWith("src/app/page.tsx"))).toBe(true);
    expect(files.some((f) => f.includes("catalogo"))).toBe(true);
    expect(files.some((f) => f.includes("blog"))).toBe(true);
  });

  it("ninguna anuncia a las redes una URL que no es la suya", () => {
    const mienten = paginas
      .filter((p) => !declaresOwnOgUrl(p.source) && !/\bmergeMetadata\b/.test(p.source))
      .map((p) => p.file);

    expect(mienten).toEqual([]);
  });

  it("el layout raíz no vuelve a fijar un og:url para todo el sitio", () => {
    // Es la causa original: un valor de página puesto en el layout no es un
    // default, es una afirmación falsa sobre cada página que no lo sobrescriba.
    const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    expect(declaresOwnOgUrl(layout)).toBe(false);
  });

  it("el detector distingue de verdad quién declara su url", () => {
    // Un detector roto (siempre true) dejaría pasar cualquier página: se prueba
    // contra fuentes sintéticas antes de fiarse de él.
    const conUrl = `export const metadata = { openGraph: { type: "website", url: "https://x/y", title: "x" } };`;
    const sinUrl = `export const metadata = { openGraph: { type: "website", title: "x", locale: "es_ES" } };`;
    // El caso que importa: `url` existe, pero es la de la imagen.
    const soloUrlDeImagen = `export const metadata = { openGraph: { title: "x", images: [{ url: "/opengraph-image", width: 1200 }] } };`;
    const urlFueraDeOg = `export const metadata = { alternates: { canonical: "https://x/y" }, twitter: { url: "https://x/y" } };`;
    const urlTrasBloqueAnidado = `export const metadata = { openGraph: { images: [{ url: "/og" }], url: "https://x/y" } };`;
    // Propiedad abreviada: `const url = ...` y luego `openGraph: { url, ... }`.
    // La primera versión del detector no la reconocía y denunciaba como
    // infractora a /categorias/[slug], que sí declara la suya.
    const urlAbreviada = `const url = \`\${SITE_URL}/x\`; export const metadata = { openGraph: { title: "x", url, images: [{ url: "/og" }] } };`;
    const urlAbreviadaAlFinal = `export const metadata = { openGraph: { title: "x", url } };`;
    // Y no confundir un nombre que acaba en "url" con la propiedad.
    const otraPropiedad = `export const metadata = { openGraph: { title: "x", imageUrl: "/og" } };`;

    expect(declaresOwnOgUrl(conUrl)).toBe(true);
    expect(declaresOwnOgUrl(sinUrl)).toBe(false);
    expect(declaresOwnOgUrl(soloUrlDeImagen)).toBe(false);
    expect(declaresOwnOgUrl(urlFueraDeOg)).toBe(false);
    expect(declaresOwnOgUrl(urlTrasBloqueAnidado)).toBe(true);
    expect(declaresOwnOgUrl(urlAbreviada)).toBe(true);
    expect(declaresOwnOgUrl(urlAbreviadaAlFinal)).toBe(true);
    expect(declaresOwnOgUrl(otraPropiedad)).toBe(false);
  });
});
