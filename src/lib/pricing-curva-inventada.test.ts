import { describe, expect, it } from "vitest";
import { applyMargin, defaultTiersFromBase, marginMultiplier, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";

/**
 * Por qué la curva sintética ya no se aplica encima de un coste conocido.
 *
 * `defaultTiersFromBase` descuenta hasta un −68 % a 250 uds. Aplicada sobre el
 * «desde» —que es el MÍNIMO de los tramos del feed, o sea el precio de volumen
 * ya— descontaba dos veces, y con el margen puesto cobraba por debajo del
 * coste. `quote-server-pricing` cobraba por esa curva y el carrito lo dejaba
 * pagar con tarjeta, porque su comprobación es «importe > 0» y una estimación
 * también la cumple.
 *
 * Desde el 3-sep-2026, sin tramos del proveedor pero con coste conocido, la
 * tarifa es PLANA a coste+margen — la misma regla que ya se aplicaba al precio
 * fijado a mano de Ádivin, y por el mismo motivo.
 *
 * Estos tests dejan la aritmética por escrito: lo que se evitaba, y que la
 * regla nueva no baja del coste en ninguna cantidad.
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

describe("la regla nueva: sin tramos reales, tarifa plana", () => {
  const coste = 1000;
  const producto = {
    id: "p1",
    name: "Producto sin tarifa",
    brand: null,
    categoryId: null,
    category: null,
    fromPriceCents: coste,
  };

  it("ninguna cantidad se cobra por debajo del coste", () => {
    const { clientTiers } = computeClientPricing({
      product: producto,
      override: null,
      providerNetTiers: undefined,
      activePromos: [],
    });
    expect(clientTiers).toBeDefined();
    for (const cantidad of [1, 10, 25, 50, 100, 250, 1000, 5000]) {
      const unidad = pickTier(clientTiers!, cantidad)!.unitPriceCents;
      expect(unidad, `a ${cantidad} uds`).toBeGreaterThan(coste);
    }
  });

  it("y el precio es exactamente el coste con el margen, en todos los tramos", () => {
    const { clientTiers } = computeClientPricing({
      product: producto,
      override: null,
      providerNetTiers: undefined,
      activePromos: [],
    });
    expect(clientTiers).toHaveLength(1);
    expect(clientTiers![0].unitPriceCents).toBe(applyMargin(coste));
    expect(pickTier(clientTiers!, 250)!.unitPriceCents).toBe(applyMargin(coste));
  });

  it("con tramos reales del proveedor la curva de volumen se respeta entera", () => {
    // La regla nueva no aplasta el escalado real: solo evita inventárselo.
    const { clientTiers } = computeClientPricing({
      product: producto,
      override: null,
      providerNetTiers: [
        { minQty: 50, unitPriceCents: 320 },
        { minQty: 250, unitPriceCents: 280 },
        { minQty: 1000, unitPriceCents: 240 },
      ],
      activePromos: [],
    });
    expect(clientTiers).toHaveLength(3);
    expect(pickTier(clientTiers!, 1000)!.unitPriceCents).toBe(applyMargin(240));
    expect(pickTier(clientTiers!, 50)!.unitPriceCents).toBe(applyMargin(320));
  });
});
