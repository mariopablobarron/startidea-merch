/**
 * Guard estático: nadie puede llamar a la API de pedidos de un proveedor sin
 * reclamar antes el cerrojo del carrito.
 *
 * Existe porque el 5-ago aparecieron tres fallos con la misma forma —un efecto
 * externo irreversible metido entre un «¿ya está hecho?» y el «apúntalo»— y el
 * barrido posterior dejó claro que la deuda estaba cerrada. Es decir: si esto
 * vuelve, volverá por código NUEVO. Una nota en el backlog no lo impide; esto
 * sí, y falla en CI antes de que llegue a producción.
 *
 * Lo que se comprueba es lo que de verdad importa, que no es «existe un
 * cerrojo» sino **el orden**: reclamar DESPUÉS de haber llamado al proveedor no
 * sirve de nada, y es un error fácil de cometer al mover código. Esa misma
 * inversión fue la mutación que estuvo a punto de colarse verde el día que se
 * escribió el cerrojo.
 *
 * Se lee el FUENTE porque el cableado no se puede comprobar ejecutando: probar
 * la función del cerrojo no demuestra que esté enchufada, que es una lección ya
 * pagada en este proyecto (`63baa46`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const RAIZ = process.cwd();

function esComentario(linea: string): boolean {
  return /^\s*(\/\/|\/\*|\*)/.test(linea);
}

/**
 * Una llamada a `createOrder`, no su definición. Las definiciones aparecen como
 * `async createOrder(payload: …)` dentro de los clientes de cada proveedor y no
 * llevan `await` ni un punto delante; las llamadas son siempre
 * `await createOrder(…)` o `algo.createOrder(…)`.
 */
function esLlamadaAPedido(linea: string): boolean {
  if (esComentario(linea)) return false;
  if (linea.includes(".createOrder(")) return true;
  return linea.includes("await ") && linea.includes("createOrder(");
}

/** Ficheros de src/ (sin tests) que llaman a la API de pedidos de un proveedor. */
function ficherosQuePiden(): string[] {
  const salida = execSync(
    "grep -rlF 'createOrder(' src/ --include='*.ts' --include='*.tsx' || true",
    { cwd: RAIZ, encoding: "utf-8" },
  );
  return salida
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.ts"))
    .filter((f) =>
      readFileSync(join(RAIZ, f), "utf-8").split("\n").some(esLlamadaAPedido),
    );
}

/** Línea (1-indexada) de la primera llamada al proveedor; -1 si no hay. */
function lineaPrimeraLlamada(fuente: string): number {
  return fuente.split("\n").findIndex(esLlamadaAPedido) + 1;
}

/** Línea de la primera reclamación del cerrojo; -1 si no hay. */
function lineaPrimerClaim(fuente: string): number {
  return (
    fuente
      .split("\n")
      .findIndex((l) => !esComentario(l) && l.includes("claimSupplierOrder(")) + 1
  );
}

describe("guard · ningún pedido a proveedor sin cerrojo", () => {
  const ficheros = ficherosQuePiden();

  it("encuentra los sitios que piden (si esto da 0, el guard no está mirando nada)", () => {
    // Sin esta comprobación el guard sería verde para siempre en cuanto un
    // cambio de nombres dejara la búsqueda sin resultados: un guard que no
    // encuentra nada pasa todas sus pruebas. Hoy son MidOcean (automático y
    // panel) y Cifra.
    expect(ficheros.length).toBeGreaterThanOrEqual(3);
  });

  it.each(ficherosQuePiden())("%s reclama el cerrojo", (fichero) => {
    const fuente = readFileSync(join(RAIZ, fichero), "utf-8");
    expect(
      lineaPrimerClaim(fuente),
      `${fichero} llama a la API de pedidos de un proveedor sin pasar por claimSupplierOrder(). ` +
        `Dos disparos solapados harían dos pedidos físicos reales. Ver src/lib/supplier-order-claim.ts.`,
    ).toBeGreaterThan(0);
  });

  it.each(ficherosQuePiden())("%s lo reclama ANTES de llamar", (fichero) => {
    const fuente = readFileSync(join(RAIZ, fichero), "utf-8");
    const claim = lineaPrimerClaim(fuente);
    const llamada = lineaPrimeraLlamada(fuente);
    expect(
      claim > 0 && claim < llamada,
      `${fichero} reclama el cerrojo en la línea ${claim} pero llama al proveedor en la ${llamada}. ` +
        `Reclamar después de pedir no cierra ninguna ventana: el orden ES el arreglo.`,
    ).toBe(true);
  });
});
