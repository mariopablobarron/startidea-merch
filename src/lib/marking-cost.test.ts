import { describe, it, expect, vi, beforeEach } from "vitest";

const markingTechniqueFindUnique = vi.fn();
const printManipulationFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    markingTechnique: {
      findUnique: (...a: unknown[]) => markingTechniqueFindUnique(...a),
    },
    printManipulation: {
      findUnique: (...a: unknown[]) => printManipulationFindUnique(...a),
    },
  },
}));

import { calculateMarkingCost } from "./marking-cost";

/**
 * Tests de src/lib/marking-cost.ts — `calculateMarkingCost` es el motor de
 * coste de marcaje (DINERO, sin ningún test hoy — hallazgo P1.10 de la
 * auditoría 2026-07-15). Mockeamos prisma.markingTechnique/printManipulation
 * para testear la aritmética real (selección de tramo, área, setup,
 * manipulación, colores extra) sin BD.
 */

type ScaleOverrides = Partial<{
  rangeId: string | null;
  areaFromCm2: number | null;
  areaToCm2: number | null;
  minQty: number;
  perCm2: boolean;
  unitCostCents: number;
  minUnitCents: number | null;
  nextColourCostCents: number | null;
}>;

function scale(overrides: ScaleOverrides = {}) {
  return {
    rangeId: null,
    areaFromCm2: null,
    areaToCm2: null,
    minQty: 1,
    perCm2: false,
    unitCostCents: 100,
    minUnitCents: null,
    nextColourCostCents: null,
    ...overrides,
  };
}

type TechniqueOverrides = Partial<{
  name: string;
  pricingType: string | null;
  hasNextColour: boolean;
  setupCents: number | null;
  setupRepeatCents: number | null;
  scales: ReturnType<typeof scale>[];
}>;

function technique(overrides: TechniqueOverrides = {}) {
  return {
    name: overrides.name ?? "Serigrafía",
    pricingType: overrides.pricingType ?? "SCALE",
    hasNextColour: overrides.hasNextColour ?? false,
    setupCents: overrides.setupCents ?? 0,
    setupRepeatCents: overrides.setupRepeatCents ?? null,
    scales: overrides.scales ?? [scale()],
  };
}

beforeEach(() => {
  markingTechniqueFindUnique.mockReset();
  printManipulationFindUnique.mockReset();
  // Default: manipulación "A" sin coste, para no tener que mockearla en cada
  // test que no le importa la manipulación.
  printManipulationFindUnique.mockResolvedValue({ code: "A", unitCostCents: 0 });
});

describe("calculateMarkingCost — validaciones de entrada", () => {
  it("quantity < 1 lanza (no tiene sentido cotizar 0 o negativo)", async () => {
    await expect(
      calculateMarkingCost({ techniqueCode: "B", quantity: 0 }),
    ).rejects.toThrow(/Quantity must be >= 1/);
  });

  it("técnica inexistente lanza (no devuelve un coste 0 silencioso)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(null);
    await expect(
      calculateMarkingCost({ techniqueCode: "NOPE", quantity: 10 }),
    ).rejects.toThrow(/Técnica de marcaje no encontrada/);
  });
});

describe("calculateMarkingCost — sin tarifa registrada (regresión marcaje a 0€)", () => {
  it("técnica sin escalas → warning, y el 0€ va SIEMPRE acompañado del warning", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales: [] }));
    const r = await calculateMarkingCost({ techniqueCode: "X", quantity: 10 });
    expect(r.totalCostCents).toBe(0);
    expect(r.warning).toBeTruthy();
    expect(r.warning).toMatch(/sin tarifa registrada/i);
  });

  it("hueco entre rangos de área (sin tramo aplicable) → warning, no 0€ silencioso", async () => {
    // Dos rangos: 100–200cm² y 200–300cm². Un área de 50cm² (por debajo de
    // ambos) no cae dentro de ningún rango y tampoco es un "excedente" que
    // clampe al tramo superior → debe fallar con warning, no cotizar barato.
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({
        scales: [
          scale({ rangeId: "r1", areaFromCm2: 100, areaToCm2: 200, unitCostCents: 50 }),
          scale({ rangeId: "r2", areaFromCm2: 200, areaToCm2: 300, unitCostCents: 80 }),
        ],
      }),
    );
    const r = await calculateMarkingCost({
      techniqueCode: "DTF",
      quantity: 10,
      printAreaCm2: 50,
    });
    expect(r.totalCostCents).toBe(0);
    expect(r.warning).toMatch(/no hay tramo/i);
  });
});

describe("calculateMarkingCost — selección de tramo por minQty (bordes)", () => {
  const scales = [
    scale({ minQty: 1, unitCostCents: 100 }),
    scale({ minQty: 50, unitCostCents: 70 }),
    scale({ minQty: 100, unitCostCents: 50 }),
  ];

  it("cantidad justo en el límite inferior de un tramo elige ESE tramo, no el anterior", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales }));
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 50 });
    expect(r.unitCostCents).toBe(70);
  });

  it("cantidad un paso por debajo del límite se queda en el tramo anterior", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales }));
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 49 });
    expect(r.unitCostCents).toBe(100);
  });

  it("cantidad en el límite superior exacto del último tramo elige el más barato", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales }));
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 100 });
    expect(r.unitCostCents).toBe(50);
  });

  it("cantidad muy por encima del último tramo se queda en el último (no falla)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales }));
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 5000 });
    expect(r.unitCostCents).toBe(50);
    expect(r.warning).toBeUndefined();
  });
});

describe("calculateMarkingCost — pricing por ÁREA (AreaRange / per-cm²)", () => {
  it("sin rangos de área definidos, el área pasada es irrelevante (usa todas las escalas)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ minQty: 1, unitCostCents: 42 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, printAreaCm2: 99999 });
    expect(r.unitCostCents).toBe(42);
    expect(r.warning).toBeUndefined();
  });

  it("técnica per-cm² SIN printAreaCm2 → warning, jamás cotiza un tramo barato en silencio", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ perCm2: true, unitCostCents: 34 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "DTF", quantity: 10 });
    expect(r.totalCostCents).toBe(0);
    expect(r.warning).toMatch(/sin área de impresión conocida/i);
  });

  it("técnica per-cm² con printAreaCm2 <= 0 → mismo warning (no cotiza área inválida)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ perCm2: true, unitCostCents: 34 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "DTF", quantity: 10, printAreaCm2: 0 });
    expect(r.totalCostCents).toBe(0);
    expect(r.warning).toMatch(/sin área de impresión conocida/i);
  });

  it("per-cm²: calcula unitCost = round(unitCostCents(centésimas) × área / 100)", async () => {
    // unitCostCents=34 (0,0034€/cm² en centésimas de céntimo) × área 200cm² / 100
    // = 68 céntimos/ud.
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ perCm2: true, unitCostCents: 34, minUnitCents: null })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "DTF", quantity: 1, printAreaCm2: 200 });
    expect(r.unitCostCents).toBe(68);
  });

  it("per-cm²: aplica el suelo minUnitCents cuando el cálculo por área queda por debajo", async () => {
    // unitCostCents=10 × área 5cm² / 100 = 0,5 → round(0,5)=1 céntimo, muy por
    // debajo del mínimo del proveedor (45 céntimos, ej. DTF).
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ perCm2: true, unitCostCents: 10, minUnitCents: 45 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "DTF", quantity: 1, printAreaCm2: 5 });
    expect(r.unitCostCents).toBe(45);
  });

  it("per-cm²: si el cálculo por área supera el mínimo, no aplica el suelo", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ scales: [scale({ perCm2: true, unitCostCents: 34, minUnitCents: 45 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "DTF", quantity: 1, printAreaCm2: 200 });
    expect(r.unitCostCents).toBe(68); // 68 > 45, no clampa al mínimo
  });

  it("área por encima de TODOS los rangos hace clamp al tramo superior (nunca 0€ ni lista vacía)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({
        scales: [
          scale({ rangeId: "r1", areaFromCm2: 0, areaToCm2: 400, minQty: 1, unitCostCents: 40 }),
          scale({ rangeId: "r2", areaFromCm2: 400, areaToCm2: 800, minQty: 1, unitCostCents: 90 }),
        ],
      }),
    );
    // Área muy por encima del tope real (800), como el sentinel mal parseado
    // "999.999" del feed (auditoría 2026-07-09).
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 1, printAreaCm2: 5000 });
    expect(r.unitCostCents).toBe(90); // tramo superior (más caro), no warning
    expect(r.warning).toBeUndefined();
  });

  it("borde compartido por dos rangos (from de uno == to del otro) elige el más AJUSTADO", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({
        scales: [
          scale({ rangeId: "r1", areaFromCm2: 0, areaToCm2: 100, minQty: 1, unitCostCents: 40 }),
          scale({ rangeId: "r2", areaFromCm2: 100, areaToCm2: 300, minQty: 1, unitCostCents: 90 }),
        ],
      }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 1, printAreaCm2: 100 });
    // Debe ganar r1 (areaTo=100, el más ajustado), no r2.
    expect(r.unitCostCents).toBe(40);
  });

  it("areaToCm2 = 0 se trata como 'sin límite superior' (sentinel del feed)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({
        scales: [scale({ rangeId: "r1", areaFromCm2: 500, areaToCm2: 0, minQty: 1, unitCostCents: 77 })],
      }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 1, printAreaCm2: 999999 });
    expect(r.unitCostCents).toBe(77);
    expect(r.warning).toBeUndefined();
  });
});

describe("calculateMarkingCost — setupCents vs setupRepeatCents", () => {
  it("pedido normal (no repetido) usa setupCents", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ setupCents: 1500, setupRepeatCents: 500 }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10 });
    expect(r.setupCents).toBe(1500);
  });

  it("pedido repetido (isRepeatOrder) usa setupRepeatCents si existe", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ setupCents: 1500, setupRepeatCents: 500 }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, isRepeatOrder: true });
    expect(r.setupCents).toBe(500);
  });

  it("pedido repetido SIN setupRepeatCents definido cae de vuelta a setupCents", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ setupCents: 1500, setupRepeatCents: null }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, isRepeatOrder: true });
    expect(r.setupCents).toBe(1500);
  });

  it("setupCents null se trata como 0 (no repetido, sin setupRepeat)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ setupCents: null, setupRepeatCents: null }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10 });
    expect(r.setupCents).toBe(0);
  });
});

describe("calculateMarkingCost — manipulación de archivo", () => {
  it("manipulationCode explícito null (proveedor no-MidOcean) NO rompe el cálculo y no cobra fee", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales: [scale({ unitCostCents: 60 })] }));
    const r = await calculateMarkingCost({
      techniqueCode: "MK_F",
      quantity: 10,
      manipulationCode: null,
    });
    expect(r.manipulationCents).toBe(0);
    expect(r.totalCostCents).toBe(600); // solo unitCost × qty, sin fee ni setup
    expect(printManipulationFindUnique).not.toHaveBeenCalled();
  });

  it("manipulationCode undefined usa el default 'A' (MidOcean)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique());
    printManipulationFindUnique.mockResolvedValueOnce({ code: "A", unitCostCents: 5 });
    await calculateMarkingCost({ techniqueCode: "B", quantity: 10 });
    expect(printManipulationFindUnique).toHaveBeenCalledWith({ where: { code: "A" } });
  });

  it("manipulación encontrada cobra unitCostCents × qty", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique());
    printManipulationFindUnique.mockResolvedValueOnce({ code: "C", unitCostCents: 8 });
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, manipulationCode: "C" });
    expect(r.manipulationCents).toBe(80);
  });

  it("manipulación no encontrada en BD se trata como coste 0 (no lanza)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique());
    printManipulationFindUnique.mockResolvedValueOnce(null);
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, manipulationCode: "Z" });
    expect(r.manipulationCents).toBe(0);
  });
});

describe("calculateMarkingCost — colores extra (nextColour)", () => {
  it("técnica multicolor con >1 color cobra los colores extra por unidad", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ hasNextColour: true, scales: [scale({ nextColourCostCents: 20 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, numberOfColours: 3 });
    // 2 colores extra × 20 céntimos × 10 uds = 400
    expect(r.nextColourTotalCents).toBe(400);
  });

  it("técnica sin hasNextColour ignora numberOfColours > 1", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ hasNextColour: false, scales: [scale({ nextColourCostCents: 20 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, numberOfColours: 3 });
    expect(r.nextColourTotalCents).toBe(0);
  });

  it("numberOfColours <= 1 no cobra colores extra aunque la técnica sea multicolor", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ hasNextColour: true, scales: [scale({ nextColourCostCents: 20 })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, numberOfColours: 1 });
    expect(r.nextColourTotalCents).toBe(0);
  });

  it("scale.nextColourCostCents null no cobra colores extra aunque numberOfColours > 1", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({ hasNextColour: true, scales: [scale({ nextColourCostCents: null })] }),
    );
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, numberOfColours: 3 });
    expect(r.nextColourTotalCents).toBe(0);
  });
});

describe("calculateMarkingCost — positionCount (varias posiciones de marcaje)", () => {
  it("positionCount multiplica el coste variable (unitCost + nextColour) pero no el setup ni la manipulación", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(
      technique({
        setupCents: 1000,
        hasNextColour: true,
        scales: [scale({ unitCostCents: 50, nextColourCostCents: 10 })],
      }),
    );
    printManipulationFindUnique.mockResolvedValueOnce({ code: "A", unitCostCents: 3 });
    const r = await calculateMarkingCost({
      techniqueCode: "B",
      quantity: 10,
      positionCount: 2,
      numberOfColours: 2,
    });
    // unitCost: 50×10×2 = 1000; nextColour: 10×1×10×2 = 200; manipulación: 3×10=30 (NO multiplica); setup 1000.
    expect(r.nextColourTotalCents).toBe(200);
    expect(r.manipulationCents).toBe(30);
    expect(r.totalCostCents).toBe(1000 + 1000 + 200 + 30);
  });

  it("positionCount 0 se trata como 1 (nunca multiplica por 0)", async () => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales: [scale({ unitCostCents: 50 })] }));
    const r = await calculateMarkingCost({ techniqueCode: "B", quantity: 10, positionCount: 0 });
    expect(r.totalCostCents).toBe(500);
  });
});

describe("calculateMarkingCost — invariante global: 0€ SIEMPRE con warning", () => {
  it.each([
    { label: "sin escalas", scales: [] as ReturnType<typeof scale>[], printAreaCm2: undefined },
    {
      label: "per-cm² sin área",
      scales: [scale({ perCm2: true })],
      printAreaCm2: undefined,
    },
  ])("$label: totalCostCents 0 nunca aparece sin `warning`", async ({ scales, printAreaCm2 }) => {
    markingTechniqueFindUnique.mockResolvedValueOnce(technique({ scales }));
    const r = await calculateMarkingCost({ techniqueCode: "X", quantity: 10, printAreaCm2 });
    if (r.totalCostCents === 0) {
      expect(r.warning).toBeTruthy();
    }
  });
});
