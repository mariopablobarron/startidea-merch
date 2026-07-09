/**
 * Cálculo del coste de marcaje según tarifa MidOcean.
 *
 * El coste TOTAL del marcaje de un pedido es:
 *   total = setup
 *         + (unitCost × qty)              ← según técnica, área y tramo
 *         + (manipulationCost × qty)      ← complejidad del archivo de impresión
 *         + (nextColourCost × extraColours × qty)  ← si multicolor
 *
 * El margen comercial se aplica fuera de esta función (no se mezcla con el coste).
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type MarkingCostInput = {
  techniqueCode: string;          // ej. "B", "L3", "S2"
  quantity: number;                // unidades del pedido
  positionCount?: number;          // posiciones distintas a marcar (default 1)
  printAreaCm2?: number;           // área de impresión en cm² (para AreaRange/ColourAreaRange)
  numberOfColours?: number;        // 1, 2, 3, 4… (para multicolor)
  // "A".."E","Z" — undefined = default "A" (MidOcean). NULL explícito = SIN
  // manipulación: las técnicas de Cifra/Makito no llevan el fee de archivo de
  // MidOcean (auditoría 2026-07-09, M17).
  manipulationCode?: string | null;
  isRepeatOrder?: boolean;         // true si reusa archivo cliché de pedido anterior
};

export type MarkingCostBreakdown = {
  techniqueCode: string;
  techniqueName: string;
  pricingType: string | null;
  unitCostCents: number;
  setupCents: number;
  manipulationCents: number;       // total manipulación = unitario × qty
  nextColourTotalCents: number;    // total de colores extra
  totalCostCents: number;
  warning?: string;
};

const DEFAULT_MANIPULATION = "A"; // Simple

export async function calculateMarkingCost(input: MarkingCostInput): Promise<MarkingCostBreakdown> {
  const {
    techniqueCode,
    quantity,
    positionCount = 1,
    printAreaCm2,
    numberOfColours = 1,
    manipulationCode = DEFAULT_MANIPULATION,
    isRepeatOrder = false,
  } = input;

  if (quantity < 1) {
    throw new Error("Quantity must be >= 1");
  }

  // 1) Técnica
  const technique = await prisma.markingTechnique.findUnique({
    where: { code: techniqueCode },
    include: { scales: true },
  });
  if (!technique) {
    throw new Error(`Técnica de marcaje no encontrada: ${techniqueCode}`);
  }
  if (technique.scales.length === 0) {
    return {
      techniqueCode,
      techniqueName: technique.name,
      pricingType: technique.pricingType,
      unitCostCents: 0,
      setupCents: 0,
      manipulationCents: 0,
      nextColourTotalCents: 0,
      totalCostCents: 0,
      warning: "Técnica sin tarifa registrada — pedir cotización manual.",
    };
  }

  // 2) Filtrar scales por rango de área (si aplica)
  const inRange = filterScalesByArea(technique.scales, printAreaCm2);

  // 3) Buscar el escalón aplicable a la cantidad
  const scale = pickScaleByQty(inRange, quantity);
  if (!scale) {
    return {
      techniqueCode,
      techniqueName: technique.name,
      pricingType: technique.pricingType,
      unitCostCents: 0,
      setupCents: 0,
      manipulationCents: 0,
      nextColourTotalCents: 0,
      totalCostCents: 0,
      warning: "No hay tramo de cantidad aplicable. Pedir cotización manual.",
    };
  }

  // Tarifa por cm² (DTF): el coste unitario real depende del área. Sin área
  // conocida NO inventamos un precio — warning y que el caller decida (el
  // checkout degrada a presupuesto; jamás cobrar 0 € o un área falsa).
  let unitCostCents: number;
  if (scale.perCm2) {
    if (printAreaCm2 == null || printAreaCm2 <= 0) {
      return {
        techniqueCode,
        techniqueName: technique.name,
        pricingType: technique.pricingType,
        unitCostCents: 0,
        setupCents: 0,
        manipulationCents: 0,
        nextColourTotalCents: 0,
        totalCostCents: 0,
        warning: "Técnica por cm² sin área de impresión conocida — pedir cotización manual.",
      };
    }
    // unitCostCents de perCm2 va en CENTÉSIMAS de céntimo/cm² (×10.000 en el
    // sync porque 0,0034 €/cm² redondeaba a 0 en céntimos). Suelo min_unit
    // del proveedor si existe (DTF: 0,45 €/ud mínimo).
    unitCostCents = Math.max(
      Math.round((scale.unitCostCents * printAreaCm2) / 100),
      scale.minUnitCents ?? 0,
    );
  } else {
    unitCostCents = scale.unitCostCents;
  }

  // 4) Setup (fijo por pedido). repeatOrder usa setupRepeat si existe.
  const setupCents =
    isRepeatOrder && technique.setupRepeatCents != null
      ? technique.setupRepeatCents
      : (technique.setupCents ?? 0);

  // 5) Manipulación (depende de complejidad del logo). null explícito = sin fee
  // (técnicas no-MidOcean); undefined = default "A".
  let manipulationCents = 0;
  if (manipulationCode !== null) {
    const manipulation = await prisma.printManipulation.findUnique({
      where: { code: manipulationCode },
    });
    manipulationCents = (manipulation?.unitCostCents ?? 0) * quantity;
  }

  // 6) Coste por colores extra (si la técnica tiene multicolor)
  let nextColourTotalCents = 0;
  if (technique.hasNextColour && numberOfColours > 1 && scale.nextColourCostCents != null) {
    const extraColours = numberOfColours - 1;
    nextColourTotalCents = scale.nextColourCostCents * extraColours * quantity;
  }

  // 7) Total. positionCount multiplica el coste de unitCost+nextColour por nº de zonas.
  const positionMultiplier = Math.max(1, positionCount);
  const variableTotal = unitCostCents * quantity * positionMultiplier + nextColourTotalCents * positionMultiplier;
  const totalCostCents = setupCents + variableTotal + manipulationCents;

  return {
    techniqueCode,
    techniqueName: technique.name,
    pricingType: technique.pricingType,
    unitCostCents,
    setupCents,
    manipulationCents,
    nextColourTotalCents: nextColourTotalCents * positionMultiplier,
    totalCostCents,
  };
}

function filterScalesByArea<
  T extends { rangeId: string | null; areaFromCm2: number | null; areaToCm2: number | null },
>(scales: T[], areaCm2: number | undefined): T[] {
  // Si no hay área especificada o la técnica no tiene rangos: devolver todos
  const hasRanges = scales.some((s) => s.rangeId != null && s.areaFromCm2 != null);
  if (!hasRanges) return scales;
  if (areaCm2 == null) {
    // Sin área especificada → cogemos el rango más pequeño (más barato) por defecto
    return scales.filter((s) => {
      const minRange = Math.min(...scales.filter((x) => x.areaFromCm2 != null).map((x) => x.areaFromCm2!));
      return s.areaFromCm2 === minRange;
    });
  }
  // Filtrar por rango aplicable: areaFrom <= areaCm2 <= areaTo
  let pool = scales.filter(
    (s) =>
      s.areaFromCm2 != null &&
      s.areaToCm2 != null &&
      areaCm2 >= s.areaFromCm2 &&
      (s.areaToCm2 === 0 || areaCm2 <= s.areaToCm2),
  );
  // Área por ENCIMA de todos los rangos → clamp al rango superior (el más
  // caro), NUNCA lista vacía. El tope del feed es un sentinel mal parseado
  // ("999.999" ≈ 1.000 cm²) o la tarifa se queda corta (bordado 800 cm²):
  // devolver [] cotizaba el marcaje a 0 € en 398 combinaciones reales
  // (auditoría 2026-07-09, espaldas de sudadera 280×400 mm).
  if (pool.length === 0) {
    const tops = scales.filter((s) => s.areaToCm2 != null && s.areaToCm2 > 0);
    if (tops.length > 0) {
      const maxTo = Math.max(...tops.map((s) => s.areaToCm2!));
      if (areaCm2 > maxTo) pool = scales.filter((s) => s.areaToCm2 === maxTo);
    }
  }
  // Borde exacto compartido por dos rangos (from de uno == to del otro) →
  // determinista: gana el rango más AJUSTADO (menor areaTo), no el orden de
  // filas de la BD (auditoría 2026-07-09, 638 combinaciones en frontera).
  if (pool.length > 0) {
    const bounded = pool.filter((s) => s.areaToCm2 != null && s.areaToCm2 > 0);
    if (bounded.length > 0) {
      const minTo = Math.min(...bounded.map((s) => s.areaToCm2!));
      const tight = pool.filter((s) => s.areaToCm2 === minTo);
      if (tight.length > 0) return tight;
    }
  }
  return pool;
}

function pickScaleByQty<T extends { minQty: number }>(scales: T[], qty: number): T | undefined {
  if (!scales.length) return undefined;
  const sorted = [...scales].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0];
  for (const s of sorted) {
    if (qty >= s.minQty) chosen = s;
  }
  return chosen;
}

/**
 * Margen comercial coste→cliente. La implementación vive en `@/lib/pricing`
 * (fuente única para todo el sitio); se re-exporta aquí por compatibilidad con
 * los importadores existentes (`import { applyMargin } from "@/lib/marking-cost"`).
 */
export { applyMargin, marginMultiplier } from "@/lib/pricing";
