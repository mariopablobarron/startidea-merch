/**
 * Guard del área táctil de los botones de CERRAR.
 *
 * Por qué existe. La auditoría de 42 agentes apuntó tres botones ✕ por debajo
 * del mínimo táctil —`EmailCapturePopup`, `SpinWheelPopup` y `Nav`— y esa
 * lista se arrastró meses en el backlog como «la tarea de los tres botones».
 * Al barrer el repo entero el 09-sep aparecieron **siete**, y los tres peores
 * no estaban en la lista: el de `Tour.tsx` no tenía caja ninguna (`text-xs`
 * sobre el glifo ✕, unos 12×16 px), el de `VoiceAgentWidget` medía 24 px y el
 * de `undo-toast` unos 22. Arreglar la lista habría dejado vivo lo peor.
 *
 * De ahí la forma de este guard, que es la misma lección que
 * [[feedback_guard_por_descubrimiento]]: **no lleva lista de qué mirar**.
 * Recorre todos los `.tsx` de `src`, se queda con los botones cuyo
 * `aria-label` habla de cerrar, y exige que cada uno alcance los 44 px. Un ✕
 * nuevo que nadie apunte suspende solo.
 *
 * Qué NO prueba, dicho claro: esto lee el código fuente, no mide píxeles en un
 * navegador. Comprueba que el botón declara un área suficiente por una de las
 * dos vías admitidas; no puede ver si un ancestro lo recorta con `overflow`.
 * Es lo que se puede sostener en CI sin arrancar un navegador, y vale porque
 * el modo de fallo real aquí es el olvido, no el recorte.
 *
 * Las dos vías admitidas:
 *   · una caja de 44 px de verdad (`min-h-[44px]`, `h-11`, `h-12`…), que es lo
 *     que ya usan los formularios del sitio;
 *   · la utilidad `.tap-target-44` de `globals.css`, que agranda el área con
 *     un pseudo-elemento sin tocar el aspecto — para los ✕ de esquina, donde
 *     un círculo de 44 px se vería como una pastilla sobre el popup. Como el
 *     pseudo-elemento va `absolute`, el botón necesita un ancestro posicionado
 *     y el más seguro es él mismo: por eso se exige también `relative` (o el
 *     `absolute`/`fixed` que ya tuviera). Sin eso el área saltaría a otro
 *     elemento y el guard pasaría sobre algo roto.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");

/** `aria-label` que identifican un botón de cerrar, en los dos idiomas del repo. */
const ES_CERRAR = /cerrar|close|descartar|dismiss/i;

/** Clases de Tailwind que ya dan 44 px o más de alto por sí solas. */
const CAJA_44 = /\b(min-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]|h-(1[1-9]|[2-9]\d)|py-(3\.5|[4-9]))\b/;

/** El botón tiene un ancestro posicionado (él mismo) para colgar el pseudo-elemento. */
const POSICIONADO = /\b(relative|absolute|fixed|sticky)\b/;

/**
 * Botones de cerrar que NO necesitan área táctil propia porque ya la tienen de
 * sobra. Cada uno con su motivo medido; la lista no decide qué se mira —se
 * mira todo—, solo documenta lo ya revisado.
 */
const REVISADOS_SIN_TAMANO: Record<string, string> = {
  // El velo del menú móvil: ocupa la pantalla entera (`absolute inset-0`).
  // Pulsar fuera cierra; su área es el viewport, no 44 px.
  "components/Nav.tsx::Cerrar menú": "velo a pantalla completa (inset-0)",
};

function tsxDeSrc(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...tsxDeSrc(ruta));
    else if (entrada.name.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

type BotonCerrar = { fichero: string; etiqueta: string; clases: string; clave: string };

/**
 * Devuelve los atributos de una apertura `<button …>`, es decir todo hasta el
 * `>` que la cierra. Cortar por el primer `>` no vale: `onClick={() => …}`
 * lleva uno dentro, y con él se perdía el velo del menú de `Nav.tsx` —el
 * barrido lo daba por inexistente y el guard pasaba sin mirarlo. Por eso
 * cuenta la profundidad de llaves y solo acepta el `>` de fuera.
 */
function atributosDeApertura(trozo: string): string {
  let llaves = 0;
  for (let i = 0; i < trozo.length; i += 1) {
    const c = trozo[i];
    if (c === "{") llaves += 1;
    else if (c === "}") llaves -= 1;
    else if (c === ">" && llaves === 0) return trozo.slice(0, i);
  }
  return trozo;
}

/**
 * Saca los botones de cerrar de un fichero. Trocea por `<button`, así que ve
 * cada apertura de etiqueta con sus atributos —que es donde viven `aria-label`
 * y `className`— sin necesitar un parser de JSX.
 */
function botonesDeCerrar(ruta: string): BotonCerrar[] {
  const fuente = readFileSync(ruta, "utf8");
  const fichero = relative(SRC, ruta);
  const encontrados: BotonCerrar[] = [];

  for (const trozo of fuente.split("<button").slice(1)) {
    const apertura = atributosDeApertura(trozo);
    const etiqueta = /aria-label="([^"]*)"/.exec(apertura)?.[1];
    if (!etiqueta || !ES_CERRAR.test(etiqueta)) continue;
    const clases = /className="([^"]*)"/.exec(apertura)?.[1] ?? "";
    encontrados.push({ fichero, etiqueta, clases, clave: `${fichero}::${etiqueta}` });
  }
  return encontrados;
}

describe("guard: los botones de cerrar llegan a 44 px de área táctil", () => {
  const botones = tsxDeSrc(SRC).flatMap(botonesDeCerrar);

  it("descubre botones de cerrar en el repo (si no, el barrido se ha roto)", () => {
    // Si un refactor cambia la forma de escribir los botones, el guard dejaría
    // de encontrar nada y pasaría en verde sin vigilar. Esto lo impide.
    expect(botones.length).toBeGreaterThanOrEqual(7);
  });

  it("cada botón de cerrar declara 44 px, por caja o por `.tap-target-44`", () => {
    const flojos = botones
      .filter((b) => !(b.clave in REVISADOS_SIN_TAMANO))
      .filter((b) => {
        if (CAJA_44.test(b.clases)) return false;
        return !(b.clases.includes("tap-target-44") && POSICIONADO.test(b.clases));
      })
      .map((b) => `${b.clave} → className="${b.clases}"`);

    expect(flojos, [
      "Estos botones de cerrar se pulsan en menos de 44 px.",
      "Arréglalo con `min-h-[44px]` si el botón puede crecer, o añadiendo",
      "`tap-target-44` junto a `relative` si crecer le estropearía el diseño.",
    ].join(" ")).toEqual([]);
  });

  it("la lista de revisados no acumula entradas muertas", () => {
    const vivas = new Set(botones.map((b) => b.clave));
    const muertas = Object.keys(REVISADOS_SIN_TAMANO).filter((k) => !vivas.has(k));
    expect(muertas, "Botones que ya no existen: quítalos de REVISADOS_SIN_TAMANO").toEqual([]);
  });
});
