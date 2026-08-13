/**
 * Guard estático del concepto editable de la línea de propuesta.
 *
 * Cierra un fallo que estuvo vivo y en verde: el editor de `/admin/cotizar`
 * rotula el campo «Concepto (lo que ve el cliente)», pero el PDF pintaba
 * `it.product?.name ?? it.description`. Como el override deja `product`
 * intacto y solo cambia `description`, el `??` NUNCA caía a la derecha: lo
 * tecleado por el comercial se perdía sin un solo error. Los 15 tests que
 * acompañaban a aquel commit pasaban todos — ninguno miraba el render.
 *
 * Y al arreglarlo se abre la puerta contraria: ese texto libre pasa a
 * imprimirse en el PDF del cliente, así que es superficie de fuga de
 * proveedor. Por eso las dos mitades se vigilan juntas; una sin la otra es
 * peor que ninguna.
 *
 * Se trabaja sobre el texto COLAPSADO: una condición partida en dos líneas ya
 * se ha escapado tres veces de guards de este repo.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPLIER_LEAK_TERMS, SUPPLIER_LEAK_HOSTS } from "./supplier-leak-terms";

const RAIZ = process.cwd();

const LIB_TERMINOS = "src/lib/supplier-leak-terms.ts";
const LIB_VALIDADOR = "src/lib/proposal-item-override.ts";
const LIB_TIPOS = "src/lib/proposal-types.ts";
const PDF = "src/lib/recommender-proposal-pdf.tsx";
const SMOKE = "scripts/money-smoke-test.mjs";

function leer(fichero: string): string {
  return readFileSync(join(RAIZ, fichero), "utf-8");
}

function colapsar(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * ¿Importa `fichero` el símbolo `nombre` DESDE `modulo`? Se exige dentro de la
 * lista de importación y no «en algún sitio del fichero»: la propia llamada
 * del cuerpo contiene el nombre, así que buscarlo suelto deja el guard verde
 * aunque el import desaparezca (ya pasó el 12-ago).
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

describe("guard · concepto editable de la línea de propuesta", () => {
  it("los ficheros vigilados existen (si esto falla, el guard no mira nada)", () => {
    for (const f of [LIB_TERMINOS, LIB_VALIDADOR, LIB_TIPOS, PDF, SMOKE]) {
      expect(existsSync(join(RAIZ, f)), `falta ${f}`).toBe(true);
    }
  });

  it("REGRESIÓN: el PDF no vuelve a tirar el concepto editado con un ?? suelto", () => {
    const texto = colapsar(leer(PDF));
    expect(
      /product\?\.name\s*\?\?\s*it\.description/.test(texto),
      `${PDF} vuelve a resolver la etiqueta con "it.product?.name ?? it.description". Con un override ` +
        `manual, product sigue relleno y el ?? nunca cae a description: el concepto que el comercial ` +
        `teclea (y que la UI promete que ve el cliente) se pierde en silencio.`,
    ).toBe(false);
  });

  it("el PDF IMPORTA proposalLineLabel de lib/, no lo reimplementa", () => {
    const texto = colapsar(leer(PDF));
    expect(
      importaDesde(texto, "proposalLineLabel", "./proposal-types"),
      `${PDF} tiene que etiquetar la línea con proposalLineLabel() de ./proposal-types.`,
    ).toBe(true);
    expect(texto.includes("proposalLineLabel(it)"), `${PDF} debe llamarlo en la fila`).toBe(true);
  });

  it("el validador del override SANEA el concepto contra nombres de proveedor", () => {
    const texto = colapsar(leer(LIB_VALIDADOR));
    expect(
      importaDesde(texto, "findSupplierLeak", "./supplier-leak-terms"),
      `${LIB_VALIDADOR} tiene que llamar a findSupplierLeak() sobre el concepto: desde que el PDF ` +
        `imprime el texto tecleado, es la única puerta por la que un nombre de proveedor llega al cliente.`,
    ).toBe(true);
    expect(texto.includes("findSupplierLeak(desc)")).toBe(true);
  });

  it("la lista de términos sigue sincronizada con el smoke de producción", () => {
    // El smoke (scripts/money-smoke-test.mjs) es Node suelto y no se puede
    // importar desde TS, así que las listas viven por duplicado. Sin esta
    // comprobación se desincronizan y el saneador deja de cubrir lo que el
    // smoke vigila —o al revés— sin que nada se ponga rojo.
    const smoke = leer(SMOKE);
    for (const term of [...SUPPLIER_LEAK_TERMS, ...SUPPLIER_LEAK_HOSTS]) {
      expect(
        smoke.includes(`"${term}"`),
        `"${term}" está en supplier-leak-terms.ts pero no en ${SMOKE}: las dos listas tienen que ` +
          `cubrir lo mismo.`,
      ).toBe(true);
    }
    // Y la dirección contraria: un término nuevo en el smoke que aquí falte
    // dejaría el concepto sin sanear contra él.
    const enSmoke = [
      ...(smoke.match(/const SUPPLIER_LEAKS = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
      ...(smoke.match(/const SUPPLIER_HOSTS = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
    ].map((m) => m[1]);
    expect(enSmoke.length, `no se pudieron leer las listas de ${SMOKE}`).toBeGreaterThanOrEqual(10);
    const aqui = new Set<string>([...SUPPLIER_LEAK_TERMS, ...SUPPLIER_LEAK_HOSTS]);
    for (const term of enSmoke) {
      expect(aqui.has(term), `"${term}" está en ${SMOKE} pero falta en ${LIB_TERMINOS}`).toBe(true);
    }
  });
});
