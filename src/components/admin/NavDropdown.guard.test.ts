import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD del megamenú del panel.
 *
 * El panel del megamenú está posicionado en absoluto, así que se dimensiona
 * por su contenido. Dentro lleva un grid cuyas columnas, en Tailwind, son
 * `minmax(0, 1fr)`: pueden encogerse hasta cero. Sin un ancho explícito que
 * repartir, las cuatro columnas colapsaban y los títulos se pintaban unos
 * encima de otros — el menú medía 114 px en una pantalla de 1400 y en vez de
 * «AUDIENCIA / CONTENIDO» se leía «AUDCONTENIDO».
 *
 * Es un fallo que no se ve en ninguna prueba de lógica y que solo aparece
 * abriendo el menú, así que se vigila el marcado: si alguien quita el ancho
 * pensando que sobra, esto se pone rojo.
 */

const RUTA = "src/components/admin/NavDropdown.tsx";

function fuente(): string {
  return readFileSync(join(process.cwd(), RUTA), "utf8");
}

/** El bloque del megamenú: desde su condición hasta el cierre del componente. */
function bloqueMegamenu(src: string): string {
  const desde = src.indexOf("open && isMega");
  expect(desde, "ya no existe la rama del megamenú en NavDropdown").toBeGreaterThan(-1);
  return src.slice(desde);
}

describe("guard · el megamenú del panel tiene ancho propio", () => {
  it("el panel declara un ancho explícito, no lo deja al contenido", () => {
    const bloque = bloqueMegamenu(fuente());
    // El `[\s"]` de delante no es adorno: sin él, `min-w-[170px]` —que está
    // en las columnas de dentro— hacía pasar este test aunque el panel no
    // declarara nada. Un guard que pasa por el motivo equivocado no vale.
    expect(
      /className="[^"]*[\s"]w-(\[|\d)/.test(bloque),
      `El panel del megamenú no declara ancho. Sin él, las columnas del grid ` +
        `(minmax(0,1fr)) colapsan y el menú se pinta encima de sí mismo. ` +
        `Ver ${RUTA}.`,
    ).toBe(true);
  });

  it("y ese ancho crece en la anchura donde pasa a cuatro columnas", () => {
    // Tres columnas piden 598 px y cuatro, 792. Un solo ancho para las dos
    // deja la de cuatro apretada o la de tres con un hueco enorme.
    const bloque = bloqueMegamenu(fuente());
    expect(
      /className="[^"]*\blg:w-(\[|\d)/.test(bloque),
      `El grid pasa a cuatro columnas en \`lg\` pero el ancho no acompaña.`,
    ).toBe(true);
  });

  it("no se desborda de la pantalla en la ventana más estrecha que lo enseña", () => {
    // El nav de escritorio aparece desde `md` (768 px). Un ancho fijo de
    // 608 px cabe, pero el `max-w` es lo que lo garantiza pase lo que pase.
    const bloque = bloqueMegamenu(fuente());
    expect(
      /className="[^"]*\bmax-w-\[/.test(bloque),
      `Sin \`max-w\`, un ancho fijo puede salirse de la ventana.`,
    ).toBe(true);
  });
});
