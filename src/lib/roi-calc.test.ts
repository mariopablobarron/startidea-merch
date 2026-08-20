import { describe, it, expect } from "vitest";
import { computeRoi, validateRoiInputs } from "./roi-calc";

/**
 * La calculadora RSC es un reclamo público (`/recursos/calculadora-rsc`) y su
 * resultado viaja a un email, a un PDF "certificado" y a una fila de
 * `RoiCalculation`. No mueve dinero, pero sí publica cifras con nuestro
 * nombre encima, así que las heurísticas se fijan aquí con sus valores
 * medidos: cambiarlas obliga a tocar este fichero y a justificarlo.
 */
const CASO_REAL = { employees: 50, annualBudgetEur: 5000, substitutionPct: 60 };

describe("computeRoi", () => {
  it("calcula el caso por defecto de la propia página", () => {
    // 5.000 € × 60% = 3.000 € reasignados.
    expect(computeRoi(CASO_REAL)).toEqual({
      co2SavedKg: 150, // 3.000/100 × 5
      workHoursDignified: 167, // 3.000/18, redondeado
      ceeProductionPct: 60,
      treesEquivalent: 7, // 150/21, redondeado
    });
  });

  it("fija las tres constantes publicadas (5 kg/100 €, 18 €/h, 21 kg/árbol)", () => {
    // Derivadas de un presupuesto redondo al 100%: si alguien mueve una
    // constante "porque sí", este test lo cuenta.
    const r = computeRoi({ employees: 1, annualBudgetEur: 100, substitutionPct: 100 });
    expect(r.co2SavedKg).toBe(5);
    const h = computeRoi({ employees: 1, annualBudgetEur: 1800, substitutionPct: 100 });
    expect(h.workHoursDignified).toBe(100);
    const t = computeRoi({ employees: 1, annualBudgetEur: 420, substitutionPct: 100 });
    expect(t.treesEquivalent).toBe(1); // 21 kg CO₂ = 1 árbol/año
  });

  it("al 0% no promete nada", () => {
    expect(computeRoi({ ...CASO_REAL, substitutionPct: 0 })).toEqual({
      co2SavedKg: 0,
      workHoursDignified: 0,
      ceeProductionPct: 0,
      treesEquivalent: 0,
    });
  });

  it("no inventa impacto con presupuesto negativo ni con % fuera de rango", () => {
    expect(computeRoi({ ...CASO_REAL, annualBudgetEur: -5000 }).co2SavedKg).toBe(0);
    // El % se recorta a [0,100]: un 500% no multiplica el CO₂ por cinco.
    expect(computeRoi({ ...CASO_REAL, substitutionPct: 500 }).co2SavedKg).toBe(
      computeRoi({ ...CASO_REAL, substitutionPct: 100 }).co2SavedKg,
    );
    expect(computeRoi({ ...CASO_REAL, substitutionPct: -20 }).co2SavedKg).toBe(0);
  });

  it("nunca devuelve NaN aunque le entren números rotos", () => {
    // Hoy no es alcanzable (el slider y `Number(...) || 0` de la UI y el zod
    // de /api/calculadora-rsc lo cortan antes), pero un NaN aquí se imprimiría
    // tal cual en el email y en el PDF del cliente.
    for (const roto of [NaN, Infinity, -Infinity]) {
      const r = computeRoi({ employees: 50, annualBudgetEur: roto, substitutionPct: roto });
      for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("validateRoiInputs", () => {
  it("acepta el caso real", () => {
    expect(validateRoiInputs(CASO_REAL)).toBeNull();
  });

  it("exige empleados, presupuesto realista y % en rango", () => {
    expect(validateRoiInputs({ ...CASO_REAL, employees: 0 })).toMatch(/empleados/i);
    expect(validateRoiInputs({ ...CASO_REAL, employees: 1_000_001 })).toMatch(/demasiado alto/i);
    expect(validateRoiInputs({ ...CASO_REAL, annualBudgetEur: 99 })).toMatch(/presupuesto/i);
    expect(validateRoiInputs({ ...CASO_REAL, annualBudgetEur: 100_000_001 })).toMatch(/demasiado alto/i);
    expect(validateRoiInputs({ ...CASO_REAL, substitutionPct: 101 })).toMatch(/entre 0 y 100/i);
    expect(validateRoiInputs({ ...CASO_REAL, substitutionPct: -1 })).toMatch(/entre 0 y 100/i);
  });

  it("acepta los extremos exactos del rango", () => {
    expect(validateRoiInputs({ employees: 1, annualBudgetEur: 100, substitutionPct: 0 })).toBeNull();
    expect(
      validateRoiInputs({ employees: 1_000_000, annualBudgetEur: 100_000_000, substitutionPct: 100 }),
    ).toBeNull();
  });

  it("rechaza NaN e Infinity en el % (colaban: NaN no es <0 ni >100)", () => {
    expect(validateRoiInputs({ ...CASO_REAL, substitutionPct: NaN })).not.toBeNull();
    expect(validateRoiInputs({ ...CASO_REAL, substitutionPct: Infinity })).not.toBeNull();
    expect(validateRoiInputs({ ...CASO_REAL, employees: NaN })).not.toBeNull();
    expect(validateRoiInputs({ ...CASO_REAL, annualBudgetEur: NaN })).not.toBeNull();
  });
});
