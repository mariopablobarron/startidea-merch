/**
 * Guard POR DESCUBRIMIENTO: la etiqueta de variante que lleva el SKU crudo del
 * proveedor solo puede usarse en superficies de admin autenticadas.
 *
 * El contexto, porque es contraintuitivo: `variantSelection.summary` lleva el
 * SKU del proveedor **por diseño**, no por descuido. El equipo comercial lo
 * necesita para cursar el pedido, y por eso `proposalVariantAdminLabel` existe.
 * Lo que no puede pasar es que ese texto salga hacia el cliente — para el
 * cliente está `proposalVariantCustomerLabel`, que solo pinta color y talla.
 *
 * Por qué este guard, además del hermano `ProposalVariantVisibility.guard.test.ts`:
 * aquél comprueba **dos ficheros escritos a mano** (`admin/propuestas/page.tsx`
 * y `recommender-proposal-pdf.tsx`). Vigila bien que no se rompa lo que ya
 * está, pero **por diseño no puede ver un renderizador nuevo**: un segundo PDF,
 * una vista del portal de cliente o un email que llamara a la etiqueta de admin
 * lo dejaría en verde. Es la misma lección que costó dos hallazgos seguidos en
 * el barrido de escapado de HTML: una lista blanca solo demuestra que no vuelve
 * lo viejo.
 *
 * Este invierte la carga: recorre `src/` entero y falla ante cualquier uso
 * NUEVO fuera de admin. Ampliar `SUPERFICIES_ADMIN` es una decisión consciente.
 *
 * Qué NO hace: no es un analizador de taint. No ve el caso de alguien que lea
 * `item.variantSelection.summary` a mano en vez de llamar a la función. Vale
 * como red sobre la vía normal, no como demostración.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const SRC = join(RAIZ, "src");

/** Las dos funciones que devuelven texto con el SKU crudo del proveedor. */
const ETIQUETAS_CON_SKU = ["proposalVariantAdminLabel", "proposalVariantSummary"];

/** Donde vive su definición: ahí aparecen por fuerza, no es un uso. */
const DEFINICION = join("src", "lib", "proposal-types.ts");

/** Rutas cuyo acceso exige sesión de admin. */
const SUPERFICIES_ADMIN = [
  join("src", "app", "admin") + sep,
  join("src", "app", "api", "admin") + sep,
];

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosDeCodigo(ruta));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada)) continue;
    if (/\.test\.(ts|tsx)$/.test(entrada)) continue;
    salida.push(ruta);
  }
  return salida;
}

type Uso = { fichero: string; linea: number; etiqueta: string; esLlamada: boolean };

function usosDeEtiquetasConSku(): Uso[] {
  const usos: Uso[] = [];
  for (const absoluta of ficherosDeCodigo(SRC)) {
    const fichero = relative(RAIZ, absoluta);
    if (fichero === DEFINICION) continue;
    const lineas = readFileSync(absoluta, "utf8").split("\n");
    lineas.forEach((linea, i) => {
      for (const etiqueta of ETIQUETAS_CON_SKU) {
        if (!linea.includes(etiqueta)) continue;
        // Se apunta cualquier mención (import incluido: importarla en una
        // superficie pública ya es señal), pero solo la LLAMADA cuenta como
        // uso vivo — un import huérfano no imprime nada.
        usos.push({
          fichero,
          linea: i + 1,
          etiqueta,
          esLlamada: new RegExp(`${etiqueta}\\s*\\(`).test(linea),
        });
      }
    });
  }
  return usos;
}

const esAdmin = (fichero: string) =>
  SUPERFICIES_ADMIN.some((prefijo) => fichero.startsWith(prefijo));

describe("guard: el SKU del proveedor solo se etiqueta en superficies de admin", () => {
  it("no hay ningún uso de la etiqueta con SKU fuera de admin", () => {
    const fuera = usosDeEtiquetasConSku().filter((u) => !esAdmin(u.fichero));
    expect(
      fuera.map((u) => `${u.fichero}:${u.linea} → ${u.etiqueta}`),
    ).toEqual([]);
  });

  it("las funciones que vigila siguen existiendo con ese nombre", () => {
    // Sin esto, un renombrado dejaría el guard buscando un nombre muerto: cero
    // usos encontrados, verde perpetuo y ninguna vigilancia. Un guard que no
    // puede fallar no vigila nada.
    const definicion = readFileSync(join(RAIZ, DEFINICION), "utf8");
    for (const etiqueta of ETIQUETAS_CON_SKU) {
      expect(definicion).toContain(`export function ${etiqueta}(`);
    }
  });

  it("sigue habiendo al menos un uso legítimo en admin", () => {
    // La otra forma de volverse vacuo: que se deje de usar en todas partes y el
    // guard pase a vigilar el vacío. Si esto falla, la etiqueta se ha quedado
    // huérfana y hay que decidir si se retira, no ampliar la excepción.
    const llamadasEnAdmin = usosDeEtiquetasConSku().filter(
      (u) => esAdmin(u.fichero) && u.esLlamada,
    );
    expect(llamadasEnAdmin.length).toBeGreaterThan(0);
  });
});
