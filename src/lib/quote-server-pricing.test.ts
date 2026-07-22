import { describe, it, expect, vi, beforeEach } from "vitest";

const productFindUnique = vi.fn();
const quoteMarkingNetMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: (...a: unknown[]) => productFindUnique(...a),
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
}) {
  const netTiers = over?.netTiers;
  return {
    id: over?.id ?? "prod-1",
    name: "Camiseta test",
    brand: "BrandX",
    categoryId: "cat-1",
    fromPriceCents: over?.fromPriceCents ?? 200,
    supplier: over?.supplier ?? "midocean",
    category: { name: "Textil" },
    override: over?.override ?? null,
    variants:
      netTiers === null
        ? []
        : [
            {
              id: "var-1",
              priceTiers: netTiers ?? [
                { minQty: 10, unitPriceCents: 100 },
                { minQty: 50, unitPriceCents: 80 },
                { minQty: 100, unitPriceCents: 60 },
              ],
            },
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

  it("sin tiers de proveedor → priceSource 'estimate' (curva sintética sobre el 'desde' cliente)", async () => {
    productFindUnique.mockResolvedValueOnce(makeProduct({ netTiers: null, fromPriceCents: 200 }));
    const r = await computeServerLinePricing(lineNoMarking, []);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceSource).toBe("estimate");
    // El precio estimado nunca es negativo ni cero (hay un "desde" con margen).
    expect(r.totalClientCents).toBeGreaterThan(0);
  });
});
