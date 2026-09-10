import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * META-GUARD por DESCUBRIMIENTO: ningún guard que descubra su propio conjunto
 * se queda sin comprobar que ese conjunto no está vacío.
 *
 * El modo de fallo que cierra esto no es teórico. Un guard que recorre lo que
 * encuentra (`readdirSync` sobre `src/app`, sobre `src/lib/suppliers`…) y
 * asevera sobre cada elemento **pasa en verde para siempre** si un día no
 * encuentra nada: un `for` sin vueltas no falla, y un `expect(infractoras)
 * .toEqual([])` sobre una lista vacía tampoco. La red de seguridad sigue ahí,
 * en verde, sin vigilar nada — y nadie se entera, porque el CI no distingue
 * «no hay infracciones» de «no he mirado».
 *
 * Medido el 10-sep-2026 sobre este repo: de los 32 guards que descubren, tres
 * no tenían ninguna comprobación de cobertura propia, y los tres estaban en
 * zona sensible — `descripcion-publica` (la frontera que tapa el argumentario
 * mayorista que llegó a producción el 07-sep), `public-api-surfaces` (el
 * catálogo que sostiene el barrido anti-fuga) y `suppliers/feed-units` (las
 * conversiones del feed que ya publicaron el stock dividido por mil).
 *
 * La regla que impone: si el fichero descubre, tiene que aseverar sobre el
 * TAMAÑO de lo descubierto. No comprueba que el umbral sea el correcto —eso no
 * se puede saber desde aquí—, solo que exista; que un guard pueda quedarse a
 * oscuras sin decirlo es lo que se cierra.
 */

const RAIZ = join(__dirname, "..");

/** Descubre su propio conjunto en vez de recorrer una lista escrita a mano. */
const DESCUBRE = /readdirSync|globSync|readdir\(/;

/**
 * Una aserción sobre el TAMAÑO de lo descubierto: `expect(<algo>.length)` con
 * un `toBeGreaterThan(...)` detrás. `toBeGreaterThan` a secas no vale como
 * prueba de cobertura —aparece también contando coincidencias de un caso
 * sintético—, así que se exige el `.length`.
 *
 * El paréntesis interior está contemplado (`ficherosDeRuta().length` es la
 * forma normal de escribirlo), y por eso hace falta descartar aparte la
 * longitud de un TEXTO: `expect(e.motivo.trim().length).toBeGreaterThan(20)`
 * mide cuántos caracteres tiene un motivo, no cuántos elementos se han
 * encontrado. Ese caso concreto es el que tenía `public-api-surfaces` mientras
 * no comprobaba nada de lo que descubría, así que darlo por bueno vaciaría de
 * sentido este guard. El heurístico es `.trim()`: mide texto, no conjuntos.
 */
const COBERTURA = /expect\((?:[^()]|\([^()]*\))*\.length[\s\S]{0,120}?toBeGreaterThan(?:OrEqual)?\(/;
const LONGITUD_DE_TEXTO = /\.trim\(\)\.length/;

function tieneCobertura(src: string): boolean {
  // Sobre el fichero entero y no línea a línea: la aserción se parte en varias
  // líneas en cuanto lleva un mensaje (`expect(x.length, "…")` con el
  // `.toBeGreaterThanOrEqual(4)` en la línea siguiente), y buscar por línea la
  // daba por ausente — el mismo modo de fallo que ya mordió al guard de texto
  // de proveedor con las asignaciones partidas.
  const global = new RegExp(COBERTURA.source, "g");
  for (const m of src.matchAll(global)) {
    if (!LONGITUD_DE_TEXTO.test(m[0])) return true;
  }
  return false;
}

function guards(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...guards(ruta));
      continue;
    }
    if (entrada.endsWith(".guard.test.ts")) salida.push(ruta);
  }
  return salida;
}

const TODOS = guards(RAIZ).map((r) => ({ rel: r.slice(RAIZ.length + 1), src: readFileSync(r, "utf8") }));
const QUE_DESCUBREN = TODOS.filter(({ src }) => DESCUBRE.test(src));

describe("todo guard por descubrimiento comprueba que sigue mirando algo", () => {
  it("ninguno descubre sin aseverar sobre el tamaño de lo descubierto", () => {
    const sinRed = QUE_DESCUBREN.filter(({ src }) => !tieneCobertura(src)).map(({ rel }) => rel);

    expect(
      sinRed,
      "Estos guards recorren lo que encuentran pero no comprueban que hayan " +
        "encontrado nada: el día que su recorrido se vacíe pasarán en verde sin " +
        "vigilar. Añádeles un `it` de cobertura propia con " +
        "`expect(<lo descubierto>.length).toBeGreaterThan(<suelo por debajo de lo medido hoy>)`:\n" +
        sinRed.join("\n"),
    ).toEqual([]);
  });

  /**
   * Cobertura propia del propio meta-guard — que se aplica a sí mismo la regla
   * que impone: si `guards()` dejara de encontrar ficheros, el `toEqual([])`
   * de arriba pasaría con el repo entero sin vigilar.
   * Medido el 10-sep-2026: 59 guards, 33 de ellos por descubrimiento.
   */
  it("sigue encontrando los guards del repo (cobertura propia)", () => {
    expect(TODOS.length).toBeGreaterThan(40);
    expect(QUE_DESCUBREN.length).toBeGreaterThan(20);
  });

  it("el detector reconoce una cobertura escrita y echa en falta la que no está", () => {
    expect(tieneCobertura("expect(ficheros.length).toBeGreaterThan(300);")).toBe(true);
    expect(tieneCobertura("expect(rutas.length, 'mensaje').toBeGreaterThanOrEqual(4);")).toBe(true);
    // La forma normal de escribirlo lleva una llamada dentro del expect.
    expect(tieneCobertura("expect(ficherosDeRuta().length).toBeGreaterThan(150);")).toBe(true);
    // Lo que NO cuenta como cobertura del conjunto: la longitud de un texto
    // suelto (el motivo de una exclusión) o una aserción de contenido. Dar por
    // buenas estas dos es lo que dejaba pasar a los tres guards que motivaron
    // este fichero: `public-api-surfaces` tenía un `toBeGreaterThan(20)` sobre
    // la longitud de un motivo, y ninguno sobre lo que descubre.
    expect(tieneCobertura("expect(e.motivo.trim().length, e.ruta).toBeGreaterThan(20);")).toBe(false);
    expect(tieneCobertura("expect(culpables).toEqual([]);")).toBe(false);
  });
});
