/**
 * Tests de la auditoría de unidades del feed.
 *
 * Lo que se vigila aquí es que la auditoría siga preguntando por lo que rompió
 * el incidente, y con los umbrales del parser — no con unos suyos. Una
 * auditoría que se inventa el listón acaba certificando su propia idea de lo
 * que es plausible.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditarUnidadesFeed, EJEMPLOS } from "./auditoria-unidades-feed";
import { AREA_MARCAJE_MINIMA_MM, STOCK_MINIMO_PLAUSIBLE } from "./suppliers/feed-units";

const variantCount = vi.fn();
const variantFindMany = vi.fn();
const posCount = vi.fn();
const posFindMany = vi.fn();
const tierCount = vi.fn();

function prismaFalso() {
  return {
    productVariant: { count: variantCount, findMany: variantFindMany },
    markingPosition: { count: posCount, findMany: posFindMany },
    priceTier: { count: tierCount },
  } as unknown as Parameters<typeof auditarUnidadesFeed>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // count() se llama cuatro veces en este orden: variantes activas, posiciones,
  // stock implausible, área implausible. priceTier.count una vez.
  variantCount.mockResolvedValueOnce(1000).mockResolvedValueOnce(0);
  posCount.mockResolvedValueOnce(500).mockResolvedValueOnce(0);
  tierCount.mockResolvedValue(0);
  variantFindMany.mockResolvedValue([]);
  posFindMany.mockResolvedValue([]);
});

describe("auditarUnidadesFeed", () => {
  it("pregunta por el stock con el umbral del parser, no con uno propio", async () => {
    await auditarUnidadesFeed(prismaFalso());
    const consulta = variantCount.mock.calls[1][0];
    expect(consulta.where.stockQty).toEqual({ gt: 0, lt: STOCK_MINIMO_PLAUSIBLE });
    // Solo catálogo vivo: un producto inactivo con 3 uds no le enseña nada a nadie.
    expect(consulta.where.product).toEqual({ active: true });
  });

  it("pregunta por las áreas con el mínimo imprimible, y por los DOS lados", async () => {
    await auditarUnidadesFeed(prismaFalso());
    const consulta = posCount.mock.calls[1][0];
    expect(consulta.where.OR).toEqual([
      { maxWidthMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
      { maxHeightMm: { gt: 0, lt: AREA_MARCAJE_MINIMA_MM } },
    ]);
  });

  it("un tramo que arranca en 1 o en 10 no es sospechoso; entre 2 y 9 sí", async () => {
    await auditarUnidadesFeed(prismaFalso());
    expect(tierCount.mock.calls[0][0].where.minQty).toEqual({ gt: 1, lt: 10 });
  });

  it("el total es la suma de los tres síntomas", async () => {
    variantCount.mockReset();
    posCount.mockReset();
    variantCount.mockResolvedValueOnce(1000).mockResolvedValueOnce(7);
    posCount.mockResolvedValueOnce(500).mockResolvedValueOnce(3);
    tierCount.mockResolvedValue(2);

    const a = await auditarUnidadesFeed(prismaFalso());
    expect(a.hallazgos).toMatchObject({
      stockImplausible: 7,
      areaMarcajeImplausible: 3,
      tramosImplausibles: 2,
      total: 12,
    });
  });

  it("dice cuánto catálogo ha mirado: 0 hallazgos sobre 0 variantes no es salud", async () => {
    const a = await auditarUnidadesFeed(prismaFalso());
    expect(a.mirado).toEqual({ variantesActivas: 1000, posicionesDeMarcaje: 500 });
  });

  it("las muestras van topadas para que un catálogo roto no devuelva miles de filas", async () => {
    await auditarUnidadesFeed(prismaFalso());
    expect(variantFindMany.mock.calls[0][0].take).toBe(EJEMPLOS);
    expect(posFindMany.mock.calls[0][0].take).toBe(EJEMPLOS);
  });

  it("publica los umbrales que ha usado, para que el informe sea interpretable", async () => {
    const a = await auditarUnidadesFeed(prismaFalso());
    expect(a.umbrales).toEqual({
      stockMinimoPlausible: STOCK_MINIMO_PLAUSIBLE,
      areaMinimaMm: AREA_MARCAJE_MINIMA_MM,
    });
  });

  it("aplana la muestra sin perder de qué proveedor viene cada fila", async () => {
    variantFindMany.mockResolvedValue([
      {
        sku: "SKU-1",
        stockQty: 3,
        product: { internalRef: "STM-000001", name: "VASO X", supplier: "makito" },
      },
    ]);
    const a = await auditarUnidadesFeed(prismaFalso());
    expect(a.muestras.stock[0]).toEqual({
      supplier: "makito",
      internalRef: "STM-000001",
      producto: "VASO X",
      sku: "SKU-1",
      stockQty: 3,
    });
  });
});
