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
 *
 * POR DESCUBRIMIENTO, no por lista blanca (02-sep). Hasta hoy este guard
 * miraba tres ficheros escritos a mano, así que solo probaba que no volvía lo
 * ya arreglado. Mientras tanto `/recursos`, `/recursos/calculadora-rsc` y
 * `/recursos/tabla-tallas-universales` servían 26 menciones de MidOcean y
 * Makito en abierto — la última con dos columnas de tabla enteras. Ninguna
 * estaba en la lista, así que ninguna falló. Ahora se recorren TODAS las
 * páginas públicas de `src/app`: si alguien crea una página nueva que nombra
 * a un proveedor, este guard la ve sin que nadie lo apunte en ningún sitio.
 *
 * Decisión de Mario (02-sep), sin excepción: «el cliente que nunca sepa el
 * nombre de dónde compramos o de nuestros proveedores». Antes había una zona
 * gris —nombrarlos como marcas del sector en contenido SEO comparativo—; ya
 * no la hay. Ver [[rule_no_supplier_exposure]].
 *
 * Límite honesto: esto lee el TEXTO FUENTE del repo. El contenido que se monta
 * con datos de BD no lo ve, y de eso responde el smoke contra producción.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findSupplierLeak, SUPPLIER_LEAK_HOSTS } from "./supplier-leak-terms";

const RAIZ = process.cwd();

/**
 * Superficies de texto que no son una `page.tsx` y que hay que nombrar a mano.
 */
const SUPERFICIES_SUELTAS = ["src/app/llms.txt/route.ts"];

/**
 * Rutas de `src/app` que NO ve un cliente anónimo: panel, área privada y los
 * flujos con token. Se excluyen porque ahí el nombre del proveedor es
 * legítimo y necesario —el equipo cursa el pedido con él—, que es justo la
 * distinción que separa una fuga de un dato interno.
 */
const NO_PUBLICAS = ["/admin/", "/clientes/", "/pay/", "/proof/"];

/** Todas las páginas públicas del árbol, descubiertas — no enumeradas. */
function descubrirPaginasPublicas(dir = "src/app", acc: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) descubrirPaginasPublicas(rel, acc);
    else if (e.name === "page.tsx" && !NO_PUBLICAS.some((p) => rel.includes(p))) acc.push(rel);
  }
  return acc;
}

const PAGINAS_PUBLICAS = descubrirPaginasPublicas();
const SUPERFICIES_DE_CONTENIDO = [...SUPERFICIES_SUELTAS, ...PAGINAS_PUBLICAS];

/**
 * Sobre una página se busca el NOMBRE del proveedor, no todo `findSupplierLeak`.
 *
 * No es una rebaja: es lo que hace que este guard sobreviva. Una `page.tsx` de
 * servidor lee datos, y las del catálogo manejan `supplierRef` en su lógica
 * interna —`normalizeLegacyCifraVariant(variant, product.supplierRef)`— sin
 * imprimirlo. Comprobar el texto entero marca hoy mismo cuatro páginas
 * núcleo (`/`, `/catalogo`, `/catalogo/[slug]`, `/comparar`) que no filtran
 * nada, y un guard que nace con cuatro falsos positivos se desactiva en una
 * semana. Lo mismo con «cifra», que es palabra corriente en los comentarios.
 *
 * Lo que sí es indefendible en una página pública —y lo que de verdad
 * filtraba— es escribir «MidOcean» o «Makito»: no existen dentro de ninguna
 * palabra española, así que aquí no hay falso positivo posible. Que
 * `supplierRef` no se IMPRIMA se prueba donde se puede probar de verdad: en
 * el smoke contra producción y en `public-quote-view.test.ts`.
 */
function nombreDeProveedorEn(texto: string): string | null {
  const h = texto.toLowerCase();
  for (const host of SUPPLIER_LEAK_HOSTS) if (h.includes(host)) return host;
  for (const nombre of ["midocean", "makito"]) if (h.includes(nombre)) return nombre;
  return null;
}

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

  it("el descubrimiento encuentra el árbol entero (si esto baja, el guard se quedó ciego)", () => {
    // Un glob roto devolvería [] y TODOS los tests de abajo pasarían sin mirar
    // nada. El número no es un objetivo: es el suelo por debajo del cual hay
    // que sospechar del recorrido, no del código vigilado.
    expect(SUPERFICIES_DE_CONTENIDO.length).toBeGreaterThan(25);
    // Y que efectivamente entren las que motivaron el cambio.
    for (const esperada of [
      "src/app/recursos/page.tsx",
      "src/app/recursos/tabla-tallas-universales/page.tsx",
      "src/app/recursos/calculadora-rsc/page.tsx",
      "src/app/privacidad/page.tsx",
      "src/app/docs/api/page.tsx",
    ]) {
      expect(SUPERFICIES_DE_CONTENIDO, `${esperada} no entró en el descubrimiento`).toContain(
        esperada,
      );
    }
  });

  it("el panel y el área privada NO se vigilan (ahí el nombre es legítimo)", () => {
    expect(SUPERFICIES_DE_CONTENIDO.some((f) => f.includes("/admin/"))).toBe(false);
  });

  for (const f of SUPERFICIES_SUELTAS) {
    it(`${f} está limpio del todo (texto puro, comprobación completa)`, () => {
      const leak = findSupplierLeak(leer(f));
      expect(
        leak,
        `${f} menciona «${leak}». Este fichero se sirve al cliente tal cual: el nombre del proveedor ` +
          `no puede aparecer. Si hace falta describir el origen, vale «fabricantes europeos».`,
      ).toBeNull();
    });
  }

  for (const f of PAGINAS_PUBLICAS) {
    it(`${f} no NOMBRA a ningún proveedor`, () => {
      const nombre = nombreDeProveedorEn(leer(f));
      expect(
        nombre,
        `${f} escribe «${nombre}» y es una página pública. Decisión de Mario (02-sep), sin ` +
          `excepción: el cliente nunca ve de dónde compramos — tampoco como «marca del sector» ` +
          `en contenido comparativo. Si hay que hablar del origen, «fabricantes europeos».`,
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
