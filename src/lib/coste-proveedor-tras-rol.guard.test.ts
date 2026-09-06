import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: ninguna ruta del panel que devuelva COSTE DE PROVEEDOR o MARGEN
 * puede conformarse con «es administrador». Tiene que mirar el rol.
 *
 * El coste al que compramos y el margen con el que vendemos son la ventaja
 * competitiva del negocio: quien los tenga puede replicar el catálogo o
 * llevárselos a la competencia. No es lo mismo que un pedido o un mockup, que
 * cualquiera del equipo necesita ver para trabajar.
 *
 * Seis rutas los servían a cualquier sesión de administrador —incluida la del
 * header legacy `X-Admin-Secret`, que no tiene cuenta ni rol asociados—:
 * el buscador del catálogo con su coste al tramo, la tarifa de marcaje, los
 * AJUSTES DE MÁRGENES (lectura y escritura), y las tres conversiones a
 * presupuesto. La propia `requireAdminSecret` ya lo advertía en su
 * documentación: «para protección por rol específico, usar requireRole()».
 *
 * POR DESCUBRIMIENTO, no por lista blanca. Se recorren TODAS las rutas de
 * `src/app/api/admin` y se marca la que importe uno de los símbolos que
 * calculan coste o margen. Una lista escrita a mano solo probaría que no
 * vuelve lo ya arreglado: de hecho, al escribir este guard aparecieron dos
 * rutas —`presupuestos/ajustes` y `quotes/[id]/presupuesto`— que la revisión
 * manual previa había pasado por alto. Si mañana alguien crea una ruta nueva
 * que devuelva coste, este guard la ve sin que nadie la apunte.
 *
 * Lo que este guard NO hace: exigir un rol concreto. `requireRole` deja pasar
 * siempre a CEO, y qué perfiles ven costes es una decisión de negocio que
 * puede cambiar. Aquí solo se exige que la decisión EXISTA en el código.
 */

const SIMBOLOS_DE_COSTE =
  /\b(costeAlTramo|desglosarMarcaje|quoteMarkingNet|clientFromPriceCents|leerMargenes|margenDeJerarquia|margenDeFamilia|applyMargin|netTotalCents|costeUnitCents)\b/;

const COMPRUEBA_ROL = /requireRole\s*\(|\.role\s*===|\.role\s*!==|allowed\.includes/;

const RAIZ = "src/app/api/admin";

function rutas(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) out.push(...rutas(p));
    else if (entrada === "route.ts") out.push(p);
  }
  return out;
}

describe("coste de proveedor y margen: siempre tras una comprobación de rol", () => {
  const todas = rutas(RAIZ);

  it("encuentra rutas del panel que analizar", () => {
    expect(todas.length).toBeGreaterThan(100);
  });

  it("ninguna ruta que calcule coste o margen se queda en «es administrador»", () => {
    const sinRol = todas
      .filter((f) => SIMBOLOS_DE_COSTE.test(readFileSync(f, "utf8")))
      .filter((f) => !COMPRUEBA_ROL.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(`${RAIZ}/`, "").replace("/route.ts", ""));

    expect(
      sinRol,
      `Estas rutas devuelven coste de proveedor o margen sin mirar el rol:\n` +
        sinRol.map((r) => `  · ${r}`).join("\n") +
        `\n\nUsa requireRole(req, "COMERCIAL") de @/lib/admin-auth.`,
    ).toEqual([]);
  });

  it("sigue habiendo rutas de coste que vigilar (el guard no se ha quedado ciego)", () => {
    const conCoste = todas.filter((f) => SIMBOLOS_DE_COSTE.test(readFileSync(f, "utf8")));
    expect(conCoste.length).toBeGreaterThanOrEqual(6);
  });
});
