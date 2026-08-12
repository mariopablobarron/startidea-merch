/**
 * Guard estático: los portes por defecto del proveedor siguen decidiéndose y
 * validándose en `lib/`, no sueltos dentro de una página o de un `route.ts`.
 *
 * Existe por una lección ya pagada dos veces en este proyecto: **testear la
 * función pura no prueba que esté enchufada**, y un esquema encerrado en un
 * `route.ts` no se puede testear en absoluto (el 12-ago bajar un `.min(1)` a
 * `.min(0)` no rompió ninguno de los 1.093 tests que había). Los tests de
 * `cotizar-portes-default.test.ts` y `supplier-profile-schema.test.ts` pasarían
 * igual de verdes si alguien volviera a copiar la lógica dentro de la página.
 *
 * Lo que se vigila no es que exista un nombre, sino el CABLEADO:
 *  1. que los ficheros de `lib/` sigan existiendo,
 *  2. que la página y la ruta los IMPORTEN,
 *  3. que no hayan vuelto a definir la decisión ni el esquema en local,
 *  4. y que `portesTouched` no vuelva a leerse desde estado dentro de la
 *     función `async` — que fue exactamente el fallo (una foto del render
 *     anterior pisando el importe recién tecleado por el admin).
 *
 * Se trabaja sobre el texto COLAPSADO porque una condición partida en dos
 * líneas ya se ha escapado tres veces de guards de este repo.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();

const LIB_DECISION = "src/lib/cotizar-portes-default.ts";
const LIB_ESQUEMA = "src/lib/supplier-profile-schema.ts";
const PAGINA = "src/app/admin/cotizar/page.tsx";
const RUTA = "src/app/api/admin/suppliers/route.ts";

function leer(fichero: string): string {
  return readFileSync(join(RAIZ, fichero), "utf-8");
}

/** Texto sin comentarios y en una sola línea: una fuga partida en dos no se escapa. */
function colapsar(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * ¿Importa `fichero` el símbolo `nombre` DESDE `modulo`?
 *
 * Mirar si el nombre aparece «en algún sitio» no vale: la propia llamada
 * `decidePortesPreload({…})` del cuerpo ya contiene el nombre, así que quitar
 * el import dejaría el guard verde con el fichero sin compilar siquiera. Se
 * exige el símbolo DENTRO de la lista de importación de ese módulo, que es lo
 * que de verdad significa «está cableado y no reimplementado».
 */
function importaDesde(texto: string, nombre: string, modulo: string): boolean {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${modulo.replace(/\//g, "\\/")}"`);
  const m = texto.match(re);
  if (!m) return false;
  return m[1]
    .split(",")
    .map((s) => s.replace(/^\s*type\s+/, "").trim())
    .includes(nombre);
}

describe("guard · cableado de los portes por defecto del proveedor", () => {
  it("los ficheros vigilados existen (si esto falla, el guard no mira nada)", () => {
    // Comprobación de cobertura propia: sin ella, mover o renombrar cualquiera
    // de estos ficheros dejaría el guard verde para siempre.
    for (const f of [LIB_DECISION, LIB_ESQUEMA, PAGINA, RUTA]) {
      expect(existsSync(join(RAIZ, f)), `falta ${f}`).toBe(true);
    }
  });

  it("el cotizador IMPORTA la decisión de lib/, no la reimplementa", () => {
    const texto = colapsar(leer(PAGINA));
    expect(
      importaDesde(texto, "decidePortesPreload", "@/lib/cotizar-portes-default") &&
        importaDesde(texto, "buildSupplierShippingMap", "@/lib/cotizar-portes-default"),
      `${PAGINA} tiene que decidir la precarga con decidePortesPreload() de @/lib/cotizar-portes-default. ` +
        `Es dinero: los portes son coste y salen multiplicados por el margen en el PVP.`,
    ).toBe(true);
  });

  it("REGRESIÓN: portesTouched no vuelve a ser estado leído dentro del async", () => {
    const texto = colapsar(leer(PAGINA));
    expect(
      /const \[\s*portesTouched\s*,/.test(texto),
      `${PAGINA} declara portesTouched con useState. Dentro de cotizar() —que es async y lo lee ` +
        `DESPUÉS del await— una variable de estado es la foto del render en que se creó: si el admin ` +
        `teclea portes mientras la petición está en vuelo, la precarga pisa lo que acaba de escribir. ` +
        `Tiene que ir en un ref (portesTouchedRef.current).`,
    ).toBe(false);
    expect(texto.includes("portesTouchedRef.current"), `${PAGINA} debe leer el ref`).toBe(true);
  });

  it("el mapa de portes por proveedor también va en un ref", () => {
    const texto = colapsar(leer(PAGINA));
    // Con estado, el prefill ?ref= (botón 💸 de /admin/products) leía siempre el
    // mapa vacío del primer render: la precarga no disparaba nunca por esa vía.
    expect(texto.includes("supplierShippingRef.current")).toBe(true);
    expect(/const \[\s*supplierShipping\s*,/.test(texto)).toBe(false);
  });

  it("la ruta de proveedores IMPORTA el esquema de lib/ y no define uno local", () => {
    const texto = colapsar(leer(RUTA));
    expect(
      importaDesde(texto, "SupplierProfileSchema", "@/lib/supplier-profile-schema"),
      `${RUTA} tiene que validar con SupplierProfileSchema de @/lib/supplier-profile-schema.`,
    ).toBe(true);
    expect(
      /z\s*\.\s*object\s*\(/.test(texto),
      `${RUTA} vuelve a definir un esquema Zod local. Un esquema dentro de un route.ts no se puede ` +
        `testear, y defaultShippingCents es dinero: precarga los portes del cotizador.`,
    ).toBe(false);
  });

  it("el esquema mantiene el cerrojo del importe (no basta con que exista)", () => {
    const texto = colapsar(leer(LIB_ESQUEMA));
    expect(texto.includes("defaultShippingCents")).toBe(true);
    expect(texto.includes(".int(")).toBe(true);
    expect(texto.includes(".min(0)")).toBe(true);
  });
});
