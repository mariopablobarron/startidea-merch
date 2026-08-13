/**
 * Utilidades compartidas por los guards de CABLEADO (`*-cableado.guard.test.ts`).
 *
 * Los guards de este repo no comprueban que una función pura funcione —para eso
 * están sus tests— sino que **siga enchufada** donde debe: que el consumidor la
 * importe de `lib/` en vez de reimplementarla por su cuenta. Esa disciplina ya
 * ha desmentido tres arreglos que parecían buenos.
 *
 * Vive aquí, y no copiado dentro de cada guard, por dos razones:
 *
 * 1. **Estaba duplicado en dos ficheros** (12-ago y 13-ago) y este repo ya sabe
 *    cómo acaba eso: lo duplicado se desincroniza callado, y un guard que se
 *    queda corto pasa en verde para siempre sin que nadie se entere.
 * 2. La copia construía la expresión regular **interpolando el nombre del
 *    módulo** (`new RegExp(\`...${modulo}...\`)`). Aquí no era explotable —el
 *    módulo es una constante escrita en el propio test, nunca entrada de nadie—
 *    pero semgrep lo marca como ReDoS y **bloqueaba el workflow «Security
 *    audit» desde el 12-ago**. Con una regex ESTÁTICA que recorre todos los
 *    imports y compara el módulo con `===`, el aviso desaparece y de paso la
 *    comparación es exacta en vez de aproximada.
 */

/** Todos los `import { … } from "…"` del texto. Estática a propósito (ver cabecera). */
const IMPORTS = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/**
 * Quita comentarios y colapsa los espacios de un fuente.
 *
 * Sin esto, una fuga partida en dos líneas se escapa del guard —ya pasó tres
 * veces— y un `import` reformateado por Prettier deja de reconocerse.
 */
export function colapsar(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * ¿Importa `texto` el símbolo `nombre` DESDE `modulo`?
 *
 * Buscar el nombre «en algún sitio del fichero» NO vale: la propia llamada del
 * cuerpo (`decidePortesPreload({…})`) ya lo contiene, así que borrar el import
 * dejaba el guard verde con el fichero sin compilar siquiera —el fallo real del
 * 12-ago—. Por eso se exige dentro de la lista de importación de ese módulo.
 *
 * Un guard se juzga por lo que NO mira.
 */
export function importaDesde(texto: string, nombre: string, modulo: string): boolean {
  for (const [, simbolos, origen] of texto.matchAll(IMPORTS)) {
    if (origen !== modulo) continue;
    const encontrado = simbolos
      .split(",")
      .map((s) => s.replace(/^\s*type\s+/, "").trim())
      .some((s) => s === nombre || s.split(/\s+as\s+/)[0].trim() === nombre);
    if (encontrado) return true;
  }
  return false;
}
