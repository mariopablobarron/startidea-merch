/**
 * Guard estático: si la ficha de producto PROMETE el boceto gratis, tiene que
 * haber un sitio donde pedirlo — en todas las fichas, también en las que no
 * tienen zonas de marcaje.
 *
 * El fallo que lo motiva (medido el 14-ago-2026, 613 de 9.591 productos activos):
 * `MockupGenerator` empezaba con `if (positions.length === 0) return null`, y el
 * formulario de «te lo hacemos nosotros» (Capa D) vive DENTRO de ese componente.
 * En esas 613 fichas el bullet «Boceto con tu logo gratis antes de producir»
 * seguía puesto, incondicional, sin nada detrás.
 *
 * Los tests de `mockup-panel-mode.test.ts` pasarían igual de verdes si alguien
 * devolviera `null` otra vez en el componente: lo que se vigila aquí es el
 * CABLEADO entre las dos mitades, no que exista una función con ese nombre.
 *
 * Las dos direcciones importan y por eso se comprueban las dos:
 *  - si vuelve el `return null`, la promesa se queda sin flujo;
 *  - si algún día se condiciona el bullet en la ficha, este guard debe enterarse
 *    (deja de aplicar tal cual y hay que revisarlo, no seguir verde por inercia).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();

const COMPONENTE = "src/components/MockupGenerator.tsx";
const FICHA = "src/app/catalogo/[slug]/page.tsx";
const LIB = "src/lib/mockup-panel-mode.ts";

function leer(fichero: string): string {
  return readFileSync(join(RAIZ, fichero), "utf-8");
}

/** Texto sin comentarios y en una sola línea: una condición partida en dos no se escapa. */
function colapsar(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * ¿Importa `fichero` el símbolo `nombre` DESDE `modulo`? Se exige dentro de la
 * lista de importación: que el nombre aparezca «en algún sitio» lo satisface la
 * propia llamada del cuerpo, y entonces quitar el import deja el guard verde.
 */
function importaDesde(texto: string, nombre: string, modulo: string): boolean {
  const abre = texto.indexOf("import {");
  if (abre === -1) return false;
  const marca = `from "${modulo}"`;
  const fin = texto.indexOf(marca);
  if (fin === -1) return false;
  const inicio = texto.lastIndexOf("import {", fin);
  if (inicio === -1) return false;
  const cierra = texto.indexOf("}", inicio);
  if (cierra === -1 || cierra > fin) return false;
  return texto
    .slice(inicio + "import {".length, cierra)
    .split(",")
    .map((s) => s.replace(/^\s*type\s+/, "").trim())
    .includes(nombre);
}

describe("guard · la promesa de boceto gratis tiene flujo en todas las fichas", () => {
  it("los ficheros vigilados existen (si esto falla, el guard no mira nada)", () => {
    for (const f of [COMPONENTE, FICHA, LIB]) {
      expect(existsSync(join(RAIZ, f)), `falta ${f}`).toBe(true);
    }
  });

  it("la ficha sigue prometiendo el boceto gratis sin condición", () => {
    // Comprobación de cobertura: si el bullet desaparece o se condiciona, este
    // guard deja de tener sentido tal cual está y hay que revisarlo a mano en vez
    // de que siga pasando en verde sin vigilar nada.
    const texto = colapsar(leer(FICHA));
    expect(
      /<Trust>Boceto con tu logo gratis/.test(texto),
      `${FICHA} ya no promete «Boceto con tu logo gratis» con ese texto. Revisa este guard: ` +
        `si la promesa se condicionó a que haya zonas de marcaje, el modo "solo-peticion" ` +
        `puede dejar de hacer falta; si solo cambió la redacción, actualiza la comprobación.`,
    ).toBe(true);
  });

  it("REGRESIÓN: MockupGenerator no vuelve a devolver null sin zonas de marcaje", () => {
    const texto = colapsar(leer(COMPONENTE));
    expect(
      /positions\.length === 0\s*\)?\s*return null/.test(texto),
      `${COMPONENTE} vuelve a esconderse entero cuando el producto no tiene MarkingPosition. ` +
        `Con él se cae también la Capa D (la petición de mockup al equipo), que es la ÚNICA vía ` +
        `de cumplir la promesa en esas fichas — 613 productos activos el 14-ago-2026. ` +
        `Lo que debe caerse es el subidor de logo, no el panel.`,
    ).toBe(false);
    expect(
      /return null/.test(texto),
      `${COMPONENTE} tiene un "return null" en el nivel del componente: sea cual sea la condición, ` +
        `deja la promesa de la ficha sin flujo detrás.`,
    ).toBe(false);
  });

  it("el componente IMPORTA la decisión de lib/, no la reimplementa", () => {
    const texto = colapsar(leer(COMPONENTE));
    expect(
      importaDesde(texto, "decideMockupPanelMode", "@/lib/mockup-panel-mode"),
      `${COMPONENTE} tiene que decidir el modo con decideMockupPanelMode() de @/lib/mockup-panel-mode. ` +
        `Un "positions.length === 0" suelto dentro del .tsx no se puede testear — y es justo el que falló.`,
    ).toBe(true);
    expect(importaDesde(texto, "mockupPanelHeading", "@/lib/mockup-panel-mode")).toBe(true);
  });

  it("el subidor de logo sí queda condicionado al modo (no se puede simular sin zonas)", () => {
    const texto = colapsar(leer(COMPONENTE));
    expect(texto.includes("!soloPeticion &&")).toBe(true);
    // Y la Capa D queda FUERA de esa condición: si alguien la mete dentro,
    // volvemos al punto de partida por otra vía.
    const posCondicion = texto.indexOf("!soloPeticion &&");
    const posCapaD = texto.indexOf("Pedir mockup técnico");
    expect(
      posCapaD > posCondicion,
      `la Capa D tiene que seguir fuera del bloque condicionado por soloPeticion.`,
    ).toBe(true);
    expect(texto.includes("submitRequest")).toBe(true);
  });

  it("la petición al equipo no exige zona de marcaje en el backend", () => {
    // Si la API pasara a exigir positionId, el modo "solo-peticion" enviaría
    // formularios que fallan siempre: la promesa volvería a ser falsa, esta vez
    // con el usuario rellenando datos para nada.
    const ruta = "src/app/api/mockup-request/route.ts";
    expect(existsSync(join(RAIZ, ruta)), `falta ${ruta}`).toBe(true);
    const texto = colapsar(leer(ruta));
    expect(
      /positionId:\s*z\.string\(\)\.optional\(\)\.nullable\(\)/.test(texto),
      `${ruta} debe seguir aceptando positionId opcional/nulo: las fichas sin zonas de marcaje ` +
        `piden el boceto sin poder mandar ninguna.`,
    ).toBe(true);
  });
});
