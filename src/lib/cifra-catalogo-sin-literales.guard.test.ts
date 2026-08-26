import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: la home no puede volver a servir dos cifras
 * distintas del mismo catálogo.
 *
 * Medido en producción el 26-ago-2026: la MISMA home decía «+9618 productos»
 * en el hero, «Más de 2.000 referencias» en el bloque de categorías y «más de
 * 9.000 productos» en el bloque SEO, con 9.618 productos activos en la base de
 * datos. El `manifest.json` añadía una cuarta, «2.400+». Ninguna estaba mal
 * escrita: cada una se escribió correcta en un momento distinto del
 * crecimiento del catálogo y se quedó vieja por su cuenta, y la más baja
 * infravendía el catálogo casi cinco veces.
 *
 * NO es una lista blanca de los ficheros que fallaban: lee los `import` de
 * `src/app/page.tsx` y revisa **todos** los bloques que la home monta. Un
 * bloque nuevo que llegue mañana con su propio literal cae igual, que es el
 * defecto de verdad — escribir la cifra a mano está permitido — y no los tres
 * sitios concretos donde se notó.
 *
 * Umbral de 1.000 a propósito: «el asistente revisa hasta 500 productos» o
 * «compara hasta 3 referencias» son otra cosa, no el tamaño del catálogo, y
 * un guard que también las denunciara obligaría a reescribir frases correctas.
 */

const SRC = join(__dirname, "..");

/** Cifra de cuatro dígitos o más seguida de un sustantivo de catálogo. */
const LITERAL_DE_CATALOGO =
  /(?<!\d)(\d{1,3}[.,]\d{3}|\d{4,})\s*\+?\s*(productos|referencias|artículos)\b/i;

/**
 * Quita comentarios antes de buscar.
 *
 * Sin esto el guard denunciaría los comentarios que EXPLICAN el defecto —
 * incluidos los de este arreglo, que citan «2.000 referencias» para dejar
 * constancia de lo corregido. Un guard que prohíbe documentar lo que vigila
 * empuja a borrar la explicación.
 */
export function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* comentario JSX */}
    .replace(/\/\*[\s\S]*?\*\//g, "") //           /* bloque */
    .replace(/^[ \t]*\/\/.*$/gm, ""); //           // línea entera
}

/** Los ficheros de los bloques que la home monta, leídos de sus propios imports. */
export function bloquesDeLaHome(fuenteHome: string): string[] {
  const rutas: string[] = [];
  for (const linea of fuenteHome.split("\n")) {
    const m = linea.match(/^import\s.*\sfrom\s+"@\/components\/([\w/-]+)"/);
    if (!m) continue;
    for (const ext of [".tsx", ".ts"]) {
      const ruta = join(SRC, "components", `${m[1]}${ext}`);
      if (existsSync(ruta)) {
        rutas.push(ruta);
        break;
      }
    }
  }
  return rutas;
}

const HOME = join(SRC, "app", "page.tsx");

describe("cifra del catálogo: una sola fuente en la home", () => {
  it("ningún bloque de la home escribe a mano el tamaño del catálogo", () => {
    const bloques = bloquesDeLaHome(readFileSync(HOME, "utf8"));
    const infractores: string[] = [];
    for (const fichero of [HOME, ...bloques]) {
      const hallazgo = sinComentarios(readFileSync(fichero, "utf8")).match(LITERAL_DE_CATALOGO);
      if (hallazgo) infractores.push(`${fichero.replace(SRC, "src")}: «${hallazgo[0].trim()}»`);
    }
    expect(
      infractores,
      `Usa formatCatalogFloor(productCount) de @/lib/catalog-count:\n${infractores.join("\n")}`,
    ).toEqual([]);
  });

  it("descubre de verdad los bloques: no está mirando una lista vacía", () => {
    // Si `bloquesDeLaHome` devolviera [], el test de arriba pasaría en verde
    // sin haber abierto nada. Van tres guards seguidos cuya primera versión
    // mentía; este comprueba que el recorrido encuentra algo real.
    const bloques = bloquesDeLaHome(readFileSync(HOME, "utf8"));
    expect(bloques.length).toBeGreaterThan(15);
    expect(bloques.some((f) => f.endsWith(join("components", "Categories.tsx")))).toBe(true);
    expect(bloques.some((f) => f.endsWith(join("components", "SeoContent.tsx")))).toBe(true);
    expect(bloques.some((f) => f.endsWith(join("components", "Hero.tsx")))).toBe(true);
  });

  it("la home cuenta el catálogo y se lo pasa a los tres bloques que lo dicen", () => {
    // El literal también desaparece si alguien borra la frase entera; esto
    // exige además que la cifra se siga contando y llegando a donde se muestra.
    const home = readFileSync(HOME, "utf8");
    expect(home).toMatch(/prisma\.product\.count/);
    expect(home).toMatch(/<Hero[\s\S]{0,400}productCount=\{hero\.productCount\}/);
    expect(home).toMatch(/<Categories[^>]*productCount=\{hero\.productCount\}/);
    expect(home).toMatch(/<SeoContent[^>]*productCount=\{hero\.productCount\}/);
  });

  it("el manifest tampoco anuncia una cifra de catálogo", () => {
    // Superficie pública aunque no sea una página: Android la lee para los
    // accesos directos de la app. Ahí vivía «Explorar 2.400+ productos».
    const manifest = readFileSync(join(SRC, "..", "public", "manifest.json"), "utf8");
    expect(manifest).not.toMatch(LITERAL_DE_CATALOGO);
  });

  it("/catalogo titula con el recuento del catálogo entero, no con el filtrado", () => {
    // `total` lleva el `where` de los filtros: con una búsqueda puesta vale 12,
    // y titular «Más de 12 productos personalizables» sería peor que el literal
    // que se quitó. El titular tiene que usar el recuento sin filtros.
    const catalogo = readFileSync(join(SRC, "app", "catalogo", "page.tsx"), "utf8");
    expect(catalogo).toMatch(/prisma\.product\.count\(\{\s*where:\s*\{\s*active:\s*true\s*\}\s*\}\)/);
    expect(catalogo).toMatch(/formatCatalogFloor\(catalogoCompleto\)/);
    expect(catalogo).not.toMatch(/formatCatalogFloor\(total\)/);
  });

  describe("el propio guard", () => {
    it("detecta los literales que existían antes del arreglo", () => {
      expect("Más de 2.000 referencias personalizables").toMatch(LITERAL_DE_CATALOGO);
      expect("Explorar 2.400+ productos").toMatch(LITERAL_DE_CATALOGO);
      expect("catálogo de 9618 productos").toMatch(LITERAL_DE_CATALOGO);
      expect("más de 9.000 productos").toMatch(LITERAL_DE_CATALOGO);
    });

    it("NO denuncia cantidades pequeñas, que hablan de otra cosa", () => {
      // Frases correctas que un umbral más bajo obligaría a reescribir.
      expect("el asistente revisa hasta 500 productos").not.toMatch(LITERAL_DE_CATALOGO);
      expect("compara hasta 3 referencias").not.toMatch(LITERAL_DE_CATALOGO);
      expect("elige 3-5 productos del catálogo").not.toMatch(LITERAL_DE_CATALOGO);
    });

    it("NO denuncia la llamada al helper, que es la forma correcta", () => {
      expect("Más de {formatCatalogFloor(productCount)} referencias").not.toMatch(
        LITERAL_DE_CATALOGO,
      );
    });

    it("no se traga los comentarios que explican el defecto", () => {
      expect(sinComentarios(`// eran 2.000 referencias\nconst a = 1;`)).not.toMatch(
        LITERAL_DE_CATALOGO,
      );
      expect(sinComentarios(`/* servía 9.000 productos */\nconst a = 1;`)).not.toMatch(
        LITERAL_DE_CATALOGO,
      );
      expect(sinComentarios(`{/* decía 2.400 productos */}`)).not.toMatch(LITERAL_DE_CATALOGO);
    });

    it("pero SÍ ve el literal que está fuera del comentario, en la misma línea", () => {
      // El fallo fácil al quitar comentarios: cargarse la línea entera y con
      // ella el texto real que se quería vigilar.
      expect(sinComentarios(`<p>Más de 2.000 referencias</p> // nota`)).toMatch(
        LITERAL_DE_CATALOGO,
      );
    });

    it("lee los imports de la home, no una lista escrita a mano", () => {
      // Un bloque nuevo entra en el ámbito solo por estar importado.
      const inventado = `import { BloqueNuevo } from "@/components/Hero";\n`;
      expect(bloquesDeLaHome(inventado).some((f) => f.endsWith("Hero.tsx"))).toBe(true);
      expect(bloquesDeLaHome(`import { X } from "@/lib/otra-cosa";`)).toEqual([]);
    });
  });
});
