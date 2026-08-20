/**
 * Modelo de cálculo de impacto RSC para merchandising corporativo.
 * Heurísticas transparentes, basadas en referencias públicas:
 *
 *   - 5 kg CO₂ ahorrados por cada 100€ reasignados de producción asiática
 *     a producción local + CEE. Equivale a unos 1,5–2 kg CO₂ ahorrados por
 *     kg de producto, asumiendo precio medio 10€/ud. Estimación conservadora
 *     basada en estudios ICAEN/INEGA y análisis ciclo vida MidOcean vs
 *     producción Andalucía (flete asiático evitado + menor distancia).
 *
 *   - 18€/hora coste laboral medio en CEE Andalucía 2026 (incluye SS).
 *     Fuente: ACEEM Andalucía + Boletín CEE.
 *
 *   - 21 kg CO₂/año = absorción media de un árbol joven en clima
 *     mediterráneo (CSIC: 5–30 kg/año según especie). Usamos 21 = ICEA.
 *
 * Las cifras son ESTIMACIONES — el certificado generado lo deja claro
 * y propone una llamada para certificación real auditada.
 */

export type RoiInputs = {
  employees: number;
  annualBudgetEur: number;
  substitutionPct: number; // 0-100
};

export type RoiResults = {
  co2SavedKg: number;
  workHoursDignified: number;
  ceeProductionPct: number;
  treesEquivalent: number;
};

const CO2_KG_PER_100_EUR = 5;
const EUR_PER_WORK_HOUR_CEE = 18;
const CO2_KG_PER_TREE_YEAR = 21;

/**
 * Un número roto (NaN/Infinity) se propaga hasta el email y el PDF del
 * cliente, que imprimirían "NaN kg CO₂" con nuestro membrete. Ante entrada no
 * finita el modelo NO promete impacto: 0 es la respuesta conservadora.
 */
function finitoOCero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export function computeRoi(inputs: RoiInputs): RoiResults {
  const budget = Math.max(0, finitoOCero(inputs.annualBudgetEur));
  const pctClamped = Math.max(0, Math.min(100, finitoOCero(inputs.substitutionPct)));
  const pct = pctClamped / 100;
  const reassigned = budget * pct;

  const co2SavedKg = Math.round((reassigned / 100) * CO2_KG_PER_100_EUR);
  const workHoursDignified = Math.round(reassigned / EUR_PER_WORK_HOUR_CEE);
  const ceeProductionPct = Math.round(pctClamped);
  const treesEquivalent = Math.round(co2SavedKg / CO2_KG_PER_TREE_YEAR);

  return {
    co2SavedKg,
    workHoursDignified,
    ceeProductionPct,
    treesEquivalent,
  };
}

/**
 * Validación básica de inputs. Devuelve error legible o null.
 */
export function validateRoiInputs(inputs: Partial<RoiInputs>): string | null {
  if (!inputs.employees || inputs.employees < 1) return "Indica el número de empleados (mínimo 1)";
  if (inputs.employees > 1_000_000) return "Número de empleados demasiado alto";
  if (!inputs.annualBudgetEur || inputs.annualBudgetEur < 100)
    return "Indica un presupuesto anual realista (mínimo 100 €)";
  if (inputs.annualBudgetEur > 100_000_000) return "Presupuesto demasiado alto";
  // `NaN` colaba: no es `< 0` ni `> 100` ni `== null`, así que llegaba entero
  // hasta el cálculo. Se exige número finito antes de comparar rangos.
  if (
    inputs.substitutionPct == null ||
    !Number.isFinite(inputs.substitutionPct) ||
    inputs.substitutionPct < 0 ||
    inputs.substitutionPct > 100
  )
    return "El % a sustituir debe estar entre 0 y 100";
  return null;
}
