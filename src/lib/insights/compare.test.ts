import { describe, it, expect } from "vitest";
import { buildComparison, resolvePreset, type PeriodKpis } from "./compare";

const baseA: PeriodKpis = {
  from: new Date(),
  to: new Date(),
  label: "A",
  recommenderQueries: 0,
  proposals: 0,
  errors: 0,
  searchQueries: 0,
  productsViewedUnique: 0,
};

describe("buildComparison · deltaPct edge cases", () => {
  it("b=0 y a>0 → +100% (no divide por cero)", () => {
    const a = { ...baseA, recommenderQueries: 50 };
    const b = { ...baseA, recommenderQueries: 0 };
    const rows = buildComparison(a, b);
    const reco = rows.find((r) => r.metric === "Consultas al recomendador")!;
    expect(reco.deltaPct).toBe(100);
    expect(reco.deltaAbs).toBe(50);
  });

  it("b=0 y a=0 → 0%", () => {
    const rows = buildComparison(baseA, baseA);
    expect(rows.every((r) => r.deltaPct === 0)).toBe(true);
    expect(rows.every((r) => r.deltaAbs === 0)).toBe(true);
  });

  it("a < b → delta negativo", () => {
    const a = { ...baseA, proposals: 10 };
    const b = { ...baseA, proposals: 20 };
    const rows = buildComparison(a, b);
    const props = rows.find((r) => r.metric === "Propuestas enviadas")!;
    expect(props.deltaAbs).toBe(-10);
    expect(props.deltaPct).toBe(-50);
  });

  it("redondea a 1 decimal", () => {
    const a = { ...baseA, searchQueries: 100 };
    const b = { ...baseA, searchQueries: 33 }; // 203.0303…%
    const rows = buildComparison(a, b);
    const sq = rows.find((r) => r.metric === "Búsquedas")!;
    expect(sq.deltaPct).toBe(203);
  });

  it("errors tiene positiveIsGood=false (semáforo invertido)", () => {
    const rows = buildComparison(baseA, baseA);
    const errors = rows.find((r) => r.metric === "Errores capturados")!;
    expect(errors.positiveIsGood).toBe(false);
    // El resto sí
    const otros = rows.filter((r) => r.metric !== "Errores capturados");
    expect(otros.every((r) => r.positiveIsGood)).toBe(true);
  });

  it("siempre devuelve las 5 métricas en el mismo orden", () => {
    const rows = buildComparison(baseA, baseA);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.metric)).toEqual([
      "Productos vistos (únicos)",
      "Búsquedas",
      "Consultas al recomendador",
      "Propuestas enviadas",
      "Errores capturados",
    ]);
  });
});

describe("resolvePreset", () => {
  it("30d → rango A de 30d, B de 30d previos sin gap", () => {
    const { a, b } = resolvePreset("30d");
    // B.to debe ser exactamente A.from
    expect(b.to.getTime()).toBe(a.from.getTime());
    // longitud A == longitud B (30d aprox)
    const lenA = a.to.getTime() - a.from.getTime();
    const lenB = b.to.getTime() - b.from.getTime();
    expect(lenA).toBe(lenB);
    expect(Math.round(lenA / (24 * 3600 * 1000))).toBe(30);
  });

  it("7d → 7 días", () => {
    const { a } = resolvePreset("7d");
    const days = (a.to.getTime() - a.from.getTime()) / (24 * 3600 * 1000);
    expect(Math.round(days)).toBe(7);
  });

  it("90d → 90 días", () => {
    const { a } = resolvePreset("90d");
    const days = (a.to.getTime() - a.from.getTime()) / (24 * 3600 * 1000);
    expect(Math.round(days)).toBe(90);
  });

  it("month_to_date → A empieza el día 1 del mes actual", () => {
    const { a } = resolvePreset("month_to_date");
    expect(a.from.getDate()).toBe(1);
    expect(a.from.getMonth()).toBe(new Date().getMonth());
    expect(a.from.getFullYear()).toBe(new Date().getFullYear());
  });

  it("previous_month → A es mes pasado completo, B mes anterior completo", () => {
    const { a, b } = resolvePreset("previous_month");
    // A.from debe ser el día 1 del mes anterior
    expect(a.from.getDate()).toBe(1);
    // B.from debe ser día 1 de hace 2 meses
    expect(b.from.getDate()).toBe(1);
    // A.to == B mes siguiente == start of current month
    expect(a.to.getMonth()).toBe(new Date().getMonth());
    // Longitudes coherentes (28-31 días cada una)
    const lenA = (a.to.getTime() - a.from.getTime()) / (24 * 3600 * 1000);
    expect(lenA).toBeGreaterThanOrEqual(28);
    expect(lenA).toBeLessThanOrEqual(31);
  });
});
