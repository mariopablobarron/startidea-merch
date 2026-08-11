import { describe, it, expect } from "vitest";
import { validateMarkingTiers } from "@/lib/marking-tiers";

/**
 * Los cuatro modos de guardar una tarifa por tramos que parece bien y cobra mal.
 * Cada bloque nombra la CONSECUENCIA, no la regla, para que el día que alguien
 * relaje una validación vea qué se rompe.
 */
describe("validateMarkingTiers", () => {
  const ok = {
    tier1MinQty: 1,
    tier1UnitCents: 120,
    tier2MinQty: 50,
    tier2UnitCents: 90,
    tier3MinQty: 250,
    tier3UnitCents: 70,
    tier4MinQty: 1000,
    tier4UnitCents: 55,
  };

  it("acepta una tarifa completa y ordenada", () => {
    expect(validateMarkingTiers(ok)).toBeNull();
  });

  it("acepta una regla SIN tramos (usa el % aproximado)", () => {
    expect(validateMarkingTiers({})).toBeNull();
    expect(
      validateMarkingTiers({ tier1MinQty: null, tier1UnitCents: null }),
    ).toBeNull();
  });

  it("acepta una tarifa parcial: solo tramos 1 y 2", () => {
    expect(
      validateMarkingTiers({
        tier1MinQty: 1,
        tier1UnitCents: 120,
        tier2MinQty: 50,
        tier2UnitCents: 90,
      }),
    ).toBeNull();
  });

  // (1) el marcaje saldría GRATIS
  it("rechaza €/ud a 0 — es el camino que cobraba el marcaje a 0 €", () => {
    const err = validateMarkingTiers({ tier1MinQty: 1, tier1UnitCents: 0 });
    expect(err).toMatch(/0 €/);
  });

  it("rechaza €/ud a 0 en un tramo alto, no solo en el primero", () => {
    expect(validateMarkingTiers({ ...ok, tier3UnitCents: 0 })).toMatch(/Tramo 3/);
  });

  it("rechaza €/ud negativo", () => {
    expect(validateMarkingTiers({ tier1MinQty: 1, tier1UnitCents: -50 })).not.toBeNull();
  });

  // (2) el tramo se ignora en silencio
  it("rechaza un tramo con cantidad pero sin precio", () => {
    expect(validateMarkingTiers({ tier1MinQty: 1, tier1UnitCents: 120, tier2MinQty: 50 })).toMatch(
      /Tramo 2 incompleto/,
    );
  });

  it("rechaza un tramo con precio pero sin cantidad", () => {
    expect(
      validateMarkingTiers({ tier1MinQty: 1, tier1UnitCents: 120, tier2UnitCents: 90 }),
    ).toMatch(/Tramo 2 incompleto/);
  });

  // (3) la cantidad cae en el tramo equivocado
  it("rechaza cantidades desordenadas (tier3 por debajo de tier2)", () => {
    expect(validateMarkingTiers({ ...ok, tier3MinQty: 10 })).toMatch(/de menor a mayor/);
  });

  it("rechaza dos tramos con la MISMA cantidad mínima (empate ambiguo)", () => {
    expect(validateMarkingTiers({ ...ok, tier2MinQty: 250 })).toMatch(/de menor a mayor/);
  });

  // (4) el más traicionero: los tramos cargados no se aplican NUNCA
  it("rechaza tramos 2-4 con el tramo 1 vacío — el consumidor los descartaría enteros", () => {
    const err = validateMarkingTiers({
      tier2MinQty: 50,
      tier2UnitCents: 90,
      tier3MinQty: 250,
      tier3UnitCents: 70,
    });
    expect(err).toMatch(/tramo 1/i);
  });
});
