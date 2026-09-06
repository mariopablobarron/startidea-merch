import { describe, it, expect, vi, beforeEach } from "vitest";

const productFindUnique = vi.fn();
const redirectFindUnique = vi.fn();
const quoteMarkingNetMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: (...a: unknown[]) => productFindUnique(...a),
    },
    productSlugRedirect: {
      findUnique: (...a: unknown[]) => redirectFindUnique(...a),
    },
  },
}));

vi.mock("@/lib/marking-quote", () => ({
  quoteMarkingNet: (...a: unknown[]) => quoteMarkingNetMock(...a),
}));

import { computeServerLinePricing, type ServerLineInput } from "./quote-server-pricing";
import { applyMargin } from "@/lib/pricing";

/**
 * Tests de src/lib/quote-server-pricing.ts — `computeServerLinePricing` es la
 * fuente AUTORITATIVA del precio de una línea EN SERVIDOR: cuando el checkout
 * es de PAGO DIRECTO (directPay), /api/cart-quote recalcula cada línea con esta
 * función y ESE total es el que se cobra en Stripe. El navegador es manipulable.
 *
 * Por eso las invariantes de esta función son de SEGURIDAD ECONÓMICA, no solo
 * de corrección:
 *   1. Una técnica que el navegador inyecte pero que NO pertenezca al producto
 *      NO se cobra (podría inyectar una técnica barata ajena → precio irreal).
 *   2. El área de impresión y el nº de colores salen de la BD (dimensiones de la
 *      posición, maxColors de la técnica), NUNCA de los valores del navegador.
 *   3. NUNCA se cobra un marcaje a 0 €: si no hay tarifa fiable, la línea degrada
 *      a presupuesto (ok:false), no se cuela gratis.
 *
 * Mockeamos prisma.product.findUnique (dato de catálogo) y quoteMarkingNet (la
 * cascada de coste de marcaje, ya testeada aparte) para aislar exclusivamente
 * la lógica autoritativa de esta función. La cascada de precio de PRODUCTO
 * (computeClientPricing/pickTier/orderTotalCents/applyMargin) se deja REAL para
 * verificar la composición numérica de verdad.
 */

type Technique = { technique: { code: string }; maxColors: number | null };
type Position = {
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  techniques: Technique[];
};

function makeProduct(over?: {
  id?: string;
  supplier?: string;
  fromPriceCents?: number | null;
  netTiers?: Array<{ minQty: number; unitPriceCents: number }> | null;
  override?: {
    customFromPriceCents: number | null;
    marginPct: number | null;
    marketingTags: string[];
  } | null;
  positions?: Position[];
  /** false = producto de variante única. */
  variantes2?: boolean;
}) {
  const netTiers = over?.netTiers;
  return {
    id: over?.id ?? "prod-1",
    name: "Camiseta test",
    brand: "BrandX",
    categoryId: "cat-1",
    // `??` no vale: con él, pasar null explícito seguía dando 200 y no se
    // podía montar el caso "producto sin coste de ninguna clase".
    fromPriceCents: over?.fromPriceCents === undefined ? 200 : over.fromPriceCents,
    supplier: over?.supplier ?? "midocean",
    category: { name: "Textil" },
    override: over?.override ?? null,
    variants:
      netTiers === null
        ? []
        : [
            {
              id: "var-1",
              sku: "SKU-1",
              priceTiers: netTiers ?? [
                { minQty: 10, unitPriceCents: 100 },
                { minQty: 50, unitPriceCents: 80 },
                { minQty: 100, unitPriceCents: 60 },
              ],
            },
            // Segunda variante MÁS CARA, como una talla grande de textil: es el
            // caso que hacía cobrar de menos cuando se ignoraba la elegida.
            ...(over?.variantes2 === false
              ? []
              : [
                  {
                    id: "var-2",
                    sku: "SKU-2",
                    priceTiers: [
                      { minQty: 10, unitPriceCents: 150 },
                      { minQty: 50, unitPriceCents: 130 },
                      { minQty: 100, unitPriceCents: 110 },
                    ],
                  },
                ]),
          ],
    positions: over?.positions ?? [],
  };
}

const lineNoMarking: ServerLineInput = {
  productSlug: "camiseta-test",
  quantity: 100,
  markings: [],
};

beforeEach(() => {
  productFindUnique.mockReset();
  redirectFindUnique.mockReset().mockResolvedValue(null);
  quoteMarkingNetMock.mockReset();
});

describe("computeServerLinePricing — rechazos autoritativos (seguridad económica)", () => {
  it("producto inexistente → ok:false, no calcula precio", async () => {
    productFindUnique.mockResolvedValueOnce(null);
    const r = await computeServerLinePricing(
      { productSlug: "no-existe", quantity: 50, markings: [] },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no encontrado/i);
  });

  it("una cesta persistida con oldSlug recalcula contra el producto canónico", async () => {
    productFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
      where.slug === "gafas-de-sol-3" ? makeProduct({}) : null,
    );
    redirectFindUnique.mockResolvedValue({ product: { slug: "gafas-de-sol-3" } });
    const result = await computeServerLinePricing(
      { productSlug: "pgafas-de-sol", quantity: 100, markings: [] },
      [],
    );
    expect(result.ok).toBe(true);
    expect(productFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "gafas-de-sol-3" } }),
    );
  });

  it("cantidad < 1 → ok:false 'Cantidad inválida' (no permite total 0/negativo)", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct({}));
    const r = await computeServerLinePricing(
      { productSlug: "camiseta-test", quantity: 0, markings: [] },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cantidad inválida/i);
  });

  it("marcaje pedido pero producto SIN posiciones → ok:false (no verificable)", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct({ positions: [] }));
    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        markings: [{ techniqueCode: "SERI" }],
      },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sin posiciones/i);
    // Nunca debió consultar la cascada de marcaje: se rechaza antes.
    expect(quoteMarkingNetMock).not.toHaveBeenCalled();
  });

  it("ANTI-INYECCIÓN: técnica que no pertenece a ninguna posición del producto → ok:false, no se cobra", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 100,
            maxHeightMm: 50,
            techniques: [{ technique: { code: "SERI" }, maxColors: 4 }],
          },
        ],
      }),
    );
    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        // El navegador inyecta una técnica ajena (p.ej. una barata de otro producto).
        markings: [{ techniqueCode: "TECNICA_AJENA_BARATA" }],
      },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no disponible/i);
    expect(quoteMarkingNetMock).not.toHaveBeenCalled();
  });

  it("REGRESIÓN marcaje a 0€: quoteMarkingNet devuelve ok:false → línea degrada, NO se cobra el marcaje gratis", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 100,
            maxHeightMm: 50,
            techniques: [{ technique: { code: "SERI" }, maxColors: 4 }],
          },
        ],
      }),
    );
    quoteMarkingNetMock.mockResolvedValueOnce({
      ok: false,
      warning: "No hay tramo de cantidad aplicable.",
    });
    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        markings: [{ techniqueCode: "SERI" }],
      },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sin tarifa fiable/i);
  });

  it("error inesperado en la cascada de marcaje → ok:false controlado (no rompe el checkout)", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 100,
            maxHeightMm: 50,
            techniques: [{ technique: { code: "SERI" }, maxColors: 4 }],
          },
        ],
      }),
    );
    quoteMarkingNetMock.mockRejectedValueOnce(new Error("BD caída"));
    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        markings: [{ techniqueCode: "SERI" }],
      },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/error al calcular marcaje/i);
  });
});

describe("computeServerLinePricing — parámetros de marcaje desde la BD, no del navegador", () => {
  it("ANTI-FRAUDE: usa el área de la BD (dimensiones de la posición) y capa colores a maxColors, IGNORANDO los del navegador", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 100, // 10 cm
            maxHeightMm: 50, // 5 cm → área BD = 50 cm²
            techniques: [{ technique: { code: "SERI" }, maxColors: 2 }],
          },
        ],
      }),
    );
    quoteMarkingNetMock.mockResolvedValueOnce({ ok: true, netTotalCents: 500 });

    await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        markings: [
          {
            techniqueCode: "SERI",
            positionId: "pos-frontal",
            // Valores manipulados por el navegador:
            printAreaCm2: 9999, // pretende un área gigante
            numberOfColours: 8, // pretende 8 colores (maxColors real = 2)
          },
        ],
      },
      [],
    );

    expect(quoteMarkingNetMock).toHaveBeenCalledTimes(1);
    const arg = quoteMarkingNetMock.mock.calls[0][0] as {
      printAreaCm2: number | null;
      numberOfColours: number;
    };
    // El área es la de la BD (50 cm²), NO el 9999 del navegador.
    expect(arg.printAreaCm2).toBe(50);
    // Los colores están capados a maxColors=2, NO los 8 del navegador.
    expect(arg.numberOfColours).toBe(2);
  });

  it("posición reclamada NO ofrece la técnica pero otra sí → reasigna a la posición correcta (no rechaza)", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 80,
            maxHeightMm: 80,
            techniques: [{ technique: { code: "BORDADO" }, maxColors: null }],
          },
          {
            positionId: "pos-trasera",
            maxWidthMm: 100,
            maxHeightMm: 100, // área = 100 cm²
            techniques: [{ technique: { code: "SERI" }, maxColors: 4 }],
          },
        ],
      }),
    );
    quoteMarkingNetMock.mockResolvedValueOnce({ ok: true, netTotalCents: 300 });

    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        // Reclama la frontal, pero SERI está en la trasera.
        markings: [{ techniqueCode: "SERI", positionId: "pos-frontal" }],
      },
      [],
    );

    expect(r.ok).toBe(true);
    // Usó las dimensiones de la posición que SÍ ofrece la técnica (trasera, 100 cm²).
    const arg = quoteMarkingNetMock.mock.calls[0][0] as { printAreaCm2: number | null };
    expect(arg.printAreaCm2).toBe(100);
  });
});

describe("computeServerLinePricing — composición del precio cliente (camino feliz)", () => {
  it("sin marcaje → total = productTier×qty con margen, marcaje 0, priceSource 'provider'", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct({}));
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tier neto a qty=100 es 60 → cliente = applyMargin(60).
    const expectedUnit = applyMargin(60);
    expect(r.productClientCents).toBe(expectedUnit * 100);
    expect(r.markingClientCents).toBe(0);
    expect(r.totalClientCents).toBe(expectedUnit * 100);
    expect(r.unitClientCents).toBe(expectedUnit);
    expect(r.priceSource).toBe("provider");
  });

  it("con marcaje válido → marcaje = applyMargin(neto) y total = producto + marcaje", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        positions: [
          {
            positionId: "pos-frontal",
            maxWidthMm: 100,
            maxHeightMm: 50,
            techniques: [{ technique: { code: "SERI" }, maxColors: 4 }],
          },
        ],
      }),
    );
    quoteMarkingNetMock.mockResolvedValueOnce({ ok: true, netTotalCents: 500 });

    const r = await computeServerLinePricing(
      {
        productSlug: "camiseta-test",
        quantity: 100,
        markings: [{ techniqueCode: "SERI", positionId: "pos-frontal" }],
      },
      [],
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expectedProductUnit = applyMargin(60);
    const expectedMarking = applyMargin(500);
    expect(r.productClientCents).toBe(expectedProductUnit * 100);
    expect(r.markingClientCents).toBe(expectedMarking);
    expect(r.totalClientCents).toBe(expectedProductUnit * 100 + expectedMarking);
    // Coherencia: el unitario reconstruye el total dividido por la cantidad.
    expect(r.unitClientCents).toBe(Math.round(r.totalClientCents / 100));
  });

  it("sin tiers de proveedor pero CON coste conocido → tarifa plana, no curva", async () => {
    // `fromPriceCents` es el MÍNIMO de los tramos del feed: ya es el precio de
    // volumen. La curva sintética encima descontaba dos veces y, con el margen
    // puesto, cobraba por debajo del coste a partir de 100 uds. Ahora la tarifa
    // es plana a coste+margen, como la del precio fijado a mano.
    productFindUnique.mockResolvedValueOnce(makeProduct({ netTiers: null, fromPriceCents: 200 }));
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceSource).toBe("provider");
    const esperado = applyMargin(200);
    expect(esperado).toBeGreaterThan(200); // nunca por debajo del coste
    expect(r.unitClientCents).toBe(esperado);
  });

  it("sin coste de ninguna clase → sigue siendo 'estimate'", async () => {
    // Aquí no hay nada que respetar: el precio sale de una heurística sobre el
    // nombre del producto. El barrido posterior al sync desactiva estos
    // productos, así que no deberían llegar a la web; si llegan, se marcan.
    productFindUnique.mockResolvedValueOnce(makeProduct({ netTiers: null, fromPriceCents: null }));
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceSource).toBe("estimate");
    expect(r.totalClientCents).toBeGreaterThan(0);
  });
});

describe("computeServerLinePricing — REGRESIÓN producto a 0 € por override corrupto", () => {
  /**
   * El vector real, hallado el 12-ago: `ProductOverride.customFromPriceCents`
   * lo teclea un humano en el admin y su Zod aceptaba `.min(0)`. Con un 0:
   *   1. `clientFromPriceCents` devolvía 0 tal cual,
   *   2. `computeClientPricing` lo metía por la rama de "tarifa plana" y dejaba
   *      `clientTiers` vacío (porque `0` es falsy),
   *   3. aquí, `productTier?.unitPriceCents ?? baseCentsForEstimate ?? 0` caía
   *      al `0` final → el producto se facturaba a 0 € en Stripe, regalando el
   *      coste de proveedor, mientras el marcaje sí se cobraba (total > 0, así
   *      que el cobro NO se bloqueaba por el `payableTotal > 0` de cart-quote).
   *
   * Es el mismo fallo que el marcaje a 0 € del 11-ago, en otra casilla: testear
   * la función pura no basta, hace falta comprobarlo DONDE SE COBRA.
   */
  it("override con customFromPriceCents = 0 → NO se cobra el producto a 0 €, vuelve al precio con margen", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        override: { customFromPriceCents: 0, marginPct: null, marketingTags: [] },
      }),
    );
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.productClientCents).toBeGreaterThan(0);
    expect(r.unitClientCents).toBeGreaterThan(0);
    // Precio sano: el del tramo NETO del proveedor a qty=100 (60) con margen.
    expect(r.unitClientCents).toBe(applyMargin(60));
    expect(r.totalClientCents).toBe(applyMargin(60) * 100);
  });

  it("override con customFromPriceCents negativo → tampoco produce un cobro ≤ 0", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        override: { customFromPriceCents: -5000, marginPct: null, marketingTags: [] },
      }),
    );
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unitClientCents).toBe(applyMargin(60));
    expect(r.totalClientCents).toBeGreaterThan(0);
  });

  it("un customFromPriceCents legítimo SIGUE mandando (el cerrojo no rompe la tarifa plana)", async () => {
    productFindUnique.mockResolvedValueOnce(
      makeProduct({
        override: { customFromPriceCents: 999, marginPct: null, marketingTags: [] },
      }),
    );
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tarifa PLANA: 999 por unidad a cualquier cantidad, sin curva sintética.
    expect(r.unitClientCents).toBe(999);
    expect(r.totalClientCents).toBe(999 * 100);
  });
});

describe("computeServerLinePricing — se cobra la tarifa de la variante COMPRADA", () => {
  /**
   * Los `PriceTier` cuelgan de la VARIANTE, no del producto: en un textil por
   * tallas la 3XL no cuesta lo que la S. Hasta el 3-sep-2026 el recálculo del
   * checkout cogía `product.variants[0]` —la primera por orden de SKU— y
   * cobraba esa tarifa comprara el cliente lo que comprara.
   *
   * El carrito ya guarda la variante en cada línea (una línea por talla), así
   * que el dato estaba: solo no se usaba.
   */
  it("con variantId, cobra los tramos de ESA variante", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct());
    const r = await computeServerLinePricing(
      { ...lineNoMarking, variantId: "var-2" },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // var-2 a 100 uds cuesta 110, no los 60 de var-1.
    expect(r.unitClientCents).toBe(applyMargin(110));
  });

  it("con variantSku legacy, también", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct());
    const r = await computeServerLinePricing(
      { ...lineNoMarking, variantSku: "SKU-2" },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unitClientCents).toBe(applyMargin(110));
  });

  it("sin variante en la línea, sigue cogiendo la primera con tarifa", async () => {
    // Comportamiento de siempre para las líneas que no la traen.
    productFindUnique.mockResolvedValueOnce(makeProduct());
    const r = await computeServerLinePricing(lineNoMarking, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unitClientCents).toBe(applyMargin(60));
  });

  it("si la variante comprada ya no tiene tarifa, no se queda sin cobrar", async () => {
    // Descatalogada entre que se añadió al carrito y el cobro: mejor la tarifa
    // de otra variante del mismo producto que un pedido sin precio.
    productFindUnique.mockResolvedValueOnce(makeProduct());
    const r = await computeServerLinePricing(
      { ...lineNoMarking, variantId: "var-fantasma" },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unitClientCents).toBe(applyMargin(60));
  });
});
