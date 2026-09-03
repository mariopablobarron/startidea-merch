import { describe, expect, it } from "vitest";
import { applyMargin, defaultTiersFromBase, marginMultiplier, pickTier } from "@/lib/pricing";

/**
 * Qué pasa cuando un producto NO tiene tarifa del proveedor.
 *
 * `product-pricing` cae entonces en `defaultTiersFromBase`, una curva de
 * volumen inventada (−68 % a 250 uds), y `quote-server-pricing` COBRA por
 * ella: el carrito deja pagar con tarjeta porque el importe es > 0, sin
 * distinguir tarifa real de estimación.
 *
 * Estos tests no arreglan nada: dejan el número por escrito y ejecutable, para
 * que la consecuencia deje de ser invisible y para que salte si alguien toca
 * la curva o el margen. La cuenta de cuántos productos están en ese estado la
 * da `scripts/audit-precios-catalogo.ts` contra la base de datos real.
 */
describe("la curva inventada vende por debajo del coste a volumen", () => {
  it("a 250 uds cobra la mitad del coste, con el margen ya aplicado", () => {
    const coste = 1000; // 10,00 € netos del proveedor
    const desde = applyMargin(coste); // 16,67 € al 40 % sobre venta
    const tramos = defaultTiersFromBase(desde);
    const a250 = pickTier(tramos, 250)!.unitPriceCents;

    // 16,67 € × 0,32 = 5,33 €, con un coste de 10,00 €.
    expect(a250).toBe(533);
    expect(a250).toBeLessThan(coste);
    // Se pierde casi la mitad del coste en cada unidad.
    expect((coste - a250) / coste).toBeGreaterThan(0.45);
  });

  it("el cruce a pérdidas ocurre ya en el tramo de 100 uds", () => {
    const coste = 1000;
    const tramos = defaultTiersFromBase(applyMargin(coste));
    // 10 y 25 uds aún cubren coste; 50 va justo; de 100 en adelante, no.
    expect(pickTier(tramos, 10)!.unitPriceCents).toBeGreaterThan(coste);
    expect(pickTier(tramos, 25)!.unitPriceCents).toBeGreaterThan(coste);
    expect(pickTier(tramos, 100)!.unitPriceCents).toBeLessThan(coste);
    expect(pickTier(tramos, 250)!.unitPriceCents).toBeLessThan(coste);
  });

  it("no es un problema del margen: subirlo no salva el tramo de 250", () => {
    // Ni con un multiplicador del doble se cubre el coste a 250 uds: el
    // −68 % de la curva se come cualquier margen razonable.
    const coste = 1000;
    const conMargenDoble = defaultTiersFromBase(applyMargin(coste, 2.0));
    expect(pickTier(conMargenDoble, 250)!.unitPriceCents).toBeLessThan(coste);
    // Haría falta un multiplicador por encima de 3,1 para no perder dinero.
    expect(1 / 0.32).toBeGreaterThan(3.1);
  });

  it("con tarifa real del proveedor esto no pasa: el margen va tramo a tramo", () => {
    // El camino correcto, para contraste: cada tramo real lleva su margen y
    // ninguno baja del coste.
    const tramosReales = [
      { minQty: 50, unitPriceCents: 320 },
      { minQty: 250, unitPriceCents: 280 },
      { minQty: 1000, unitPriceCents: 240 },
    ];
    for (const t of tramosReales) {
      const cliente = applyMargin(t.unitPriceCents);
      expect(cliente, `tramo ${t.minQty}`).toBeGreaterThan(t.unitPriceCents);
    }
  });

  it("el margen configurado es el 40 % sobre venta del encargo", () => {
    // Ancla: si alguien cambia MARGIN_MULTIPLIER, esto lo dice.
    const m = marginMultiplier();
    expect((1 - 1 / m) * 100).toBeCloseTo(40, 1);
  });
});
