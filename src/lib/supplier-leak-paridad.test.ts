/**
 * Paridad de COMPORTAMIENTO entre las dos implementaciones del detector de
 * fuga de proveedor: `findSupplierLeak()` (TS, sanea lo que teclea el comercial
 * antes de que llegue al PDF del cliente) y `findLeak()` de
 * `scripts/money-smoke-test.mjs` (Node suelto, corre en CI contra producción).
 *
 * Existen por duplicado porque un script Node no puede importar TypeScript. Ya
 * había un guard que comparaba las dos LISTAS término a término, y aun así el
 * 13-ago divergieron: las listas seguían idénticas y lo que cambió fue CÓMO se
 * buscaba —el smoke pasó a exigir palabra completa para todo— con el efecto de
 * dejar de ver `midoceanOrderId`, el campo cuya fuga se había cerrado la
 * víspera en la API pública v1.
 *
 * De ahí este fichero: comparar texto no basta, hay que EJECUTAR las dos y
 * exigir la misma respuesta. Es la única red que habría cazado aquello.
 */
import { describe, it, expect } from "vitest";
import { findSupplierLeak } from "./supplier-leak-terms";
// @ts-expect-error -- script Node suelto, sin tipos; se importa por su comportamiento.
import { findLeak } from "../../scripts/money-smoke-test.mjs";

/**
 * Cada caso es una fuga real o un texto legítimo real, no un ejemplo
 * inventado: los identificadores salieron de la fuga del 13-ago y las frases
 * en español, de las páginas que tumbaron el CI ese mismo día.
 */
const CASOS: Array<{ texto: string; espera: string | null; porque: string }> = [
  // — Fugas dentro de un identificador: el fallo que este arreglo cierra —
  { texto: '{"fulfillment":{"midoceanOrderId":"ORD-9"}}', espera: "midocean", porque: "campo de la API v1 (fuga del 13-ago)" },
  { texto: '{"midoceanOrderStatus":"sent"}', espera: "midocean", porque: "el otro campo de la misma fuga" },
  { texto: '{"makito_sku":"MK-1234"}', espera: "makito", porque: "nombre de campo en snake_case" },
  { texto: '<div data-supplier="midocean-eu">', espera: "midocean", porque: "atributo HTML servido" },
  { texto: '{"cifraOrderId":"C-1"}', espera: "cifra", porque: "wordlike pegado a mayúscula" },
  { texto: '{"cifra_ref":"C-1"}', espera: "cifra", porque: "wordlike pegado a guion bajo" },

  // — Fugas «clásicas», en prosa —
  { texto: "Ref. MidOcean 1234", espera: "midocean", porque: "nombre suelto, insensible a mayúsculas" },
  { texto: "proveedor: makito.", espera: "makito", porque: "pegado a puntuación" },
  { texto: "Textil Cifra, talla L", espera: "cifra", porque: "wordlike como palabra suelta" },
  { texto: "«Adivin»", espera: "adivin", porque: "entre comillas españolas" },
  { texto: "campo supplier_ref del feed", espera: "supplier_ref", porque: "término con guion bajo" },
  { texto: "supplierRef=ABC", espera: "supplierref", porque: "camelCase de la ref interna" },

  // — Hosts de CDN: van por subcadena porque varios no nombran al proveedor —
  { texto: "https://publicatalogue.com/p/9.jpg", espera: "publicatalogue.com", porque: "la fuga del 2026-07-20" },
  { texto: '<img src="https://cdn1.midocean.com/a.jpg">', espera: "cdn1.midocean.com", porque: "CDN del proveedor" },

  // — Texto legítimo: marcarlo es lo que acaba con el saneador desactivado —
  { texto: "Texto descifrado y cifrado del pedido", espera: null, porque: "«cifrado» tumbó el CI el 13-ago" },
  { texto: "cifras concretas de facturación", espera: null, porque: "«cifras» tumbó el CI el 13-ago" },
  { texto: "Adivinanza impresa en la taza", espera: null, porque: "«adivinanza» contiene «adivin»" },
  { texto: "Sudadera orgánica negra con logo bordado a 1 color", espera: null, porque: "concepto de propuesta real" },
  { texto: "", espera: null, porque: "texto vacío" },
];

describe("paridad findSupplierLeak (TS) ↔ findLeak (smoke de CI)", () => {
  it("el smoke exporta findLeak (si deja de hacerlo, este fichero no prueba nada)", () => {
    expect(typeof findLeak, "scripts/money-smoke-test.mjs debe exportar findLeak").toBe("function");
  });

  for (const { texto, espera, porque } of CASOS) {
    it(`${espera === null ? "deja pasar" : `caza «${espera}» en`} ${JSON.stringify(texto).slice(0, 46)} — ${porque}`, () => {
      expect(findSupplierLeak(texto), `findSupplierLeak (TS) falla: ${porque}`).toBe(espera);
      expect(findLeak(texto), `findLeak (smoke de CI) falla: ${porque}`).toBe(espera);
    });
  }

  it("cobertura: se comprueban fugas Y textos legítimos, no solo una cara", () => {
    // Sin esto, alguien podría dejar la lista con solo casos negativos y un
    // detector que no detecta nada seguiría en verde.
    const fugas = CASOS.filter((c) => c.espera !== null).length;
    const limpios = CASOS.filter((c) => c.espera === null).length;
    expect(fugas, "faltan casos de fuga").toBeGreaterThanOrEqual(12);
    expect(limpios, "faltan casos de texto legítimo").toBeGreaterThanOrEqual(4);
  });
});
