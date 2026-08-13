/**
 * Guard de las superficies PÚBLICAS de contenido y de contrato: ninguna puede
 * nombrar a un proveedor.
 *
 * Existe porque el barrido anti-fuga que había estaba pensado para fichas de
 * producto y no miraba las páginas de contenido. Durante meses estuvieron
 * sirviendo, en abierto y con 200:
 *   · `/llms.txt` → «productos de 3 proveedores europeos (MidOcean, Makito,
 *     Cifra)» — y es justo el fichero que los modelos leen para describir el
 *     negocio, así que la fuga se propaga citada por terceros.
 *   · `/docs/api` → el campo `midoceanOrderId` del contrato público.
 *   · `/privacidad` → los citaba como destinatarios de datos.
 *
 * Lo que este guard NO hace: buscar el nombre en cualquier fichero del repo.
 * La mayoría de los aciertos de un `grep` así son legítimos (los crons de
 * sincronización, el proxy de imágenes, el webhook de Stripe) y un guard
 * ruidoso acaba desactivado. Se vigilan solo los ficheros cuyo contenido SALE
 * hacia el cliente, y para el contrato de la API se prueba el comportamiento
 * en `public-quote-view.test.ts`, no el texto.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findSupplierLeak } from "./supplier-leak-terms";

const RAIZ = process.cwd();

/** Ficheros cuyo texto se sirve tal cual al cliente. */
const SUPERFICIES_DE_CONTENIDO = [
  "src/app/llms.txt/route.ts",
  "src/app/docs/api/page.tsx",
  "src/app/privacidad/page.tsx",
];

const RUTA_V1 = "src/app/api/v1/quotes/[id]/route.ts";
const LIB_VISTA = "src/lib/public-quote-view.ts";

function leer(f: string): string {
  return readFileSync(join(RAIZ, f), "utf-8");
}

describe("guard · superficies públicas sin nombre de proveedor", () => {
  it("los ficheros vigilados existen (si esto falla, el guard no mira nada)", () => {
    for (const f of [...SUPERFICIES_DE_CONTENIDO, RUTA_V1, LIB_VISTA]) {
      expect(existsSync(join(RAIZ, f)), `falta ${f}`).toBe(true);
    }
  });

  for (const f of SUPERFICIES_DE_CONTENIDO) {
    it(`${f} no nombra a ningún proveedor`, () => {
      const leak = findSupplierLeak(leer(f));
      expect(
        leak,
        `${f} menciona «${leak}». Este fichero se sirve al cliente en abierto: el nombre del proveedor ` +
          `no puede aparecer. Si hace falta describir el origen, vale «fabricantes europeos».`,
      ).toBeNull();
    });
  }

  it("la ruta v1 construye la respuesta con toPublicQuoteView, no a mano", () => {
    // Sin esto, alguien puede volver a serializar el objeto dentro del
    // route.ts —donde no hay test que lo mire— y reintroducir el campo con
    // nombre de proveedor. El QUÉ sale se prueba en public-quote-view.test.ts.
    const texto = leer(RUTA_V1)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join(" ")
      .replace(/\s+/g, " ");
    const m = texto.match(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/public-quote-view"/);
    expect(
      m && m[1].split(",").map((s) => s.trim()).includes("toPublicQuoteView"),
      `${RUTA_V1} tiene que devolver toPublicQuoteView(...) de @/lib/public-quote-view.`,
    ).toBe(true);
    expect(texto.includes("toPublicQuoteView(cart")).toBe(true);
    // Y que no vuelva a emitir el bloque a mano con el nombre del proveedor.
    expect(
      /fulfillment:\s*\{[^}]*midocean/i.test(texto),
      `${RUTA_V1} vuelve a emitir un campo con el nombre del proveedor en la respuesta pública.`,
    ).toBe(false);
  });

  it("el smoke de producción barre también las superficies de contenido", () => {
    // El guard estático solo ve el repo; estas páginas se montan con datos, y
    // quien confirma que lo SERVIDO está limpio es el smoke contra producción.
    const smoke = leer("scripts/money-smoke-test.mjs");
    for (const ruta of ["/llms.txt", "/docs/api", "/privacidad"]) {
      expect(
        smoke.includes(`path: "${ruta}"`),
        `${ruta} no está en publicSurfaces de money-smoke-test.mjs: si mañana filtra, nadie se entera.`,
      ).toBe(true);
    }
  });
});
