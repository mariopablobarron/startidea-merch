import { describe, it, expect } from "vitest";
import { createSyncBreaker } from "./sync-circuit-breaker";

describe("createSyncBreaker", () => {
  it("no corta con fallos puntuales entre éxitos", () => {
    const b = createSyncBreaker();
    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) b.fail();
      else b.ok();
      expect(b.tripped()).toBe(false); // 10% de fallos, nunca corta
    }
  });

  it("corta por ratio: >30% de fallos con muestra suficiente", () => {
    const b = createSyncBreaker();
    // 12 ok + 8 fail = 20 muestras, 40% fallos → corta
    for (let i = 0; i < 12; i++) b.ok();
    for (let i = 0; i < 7; i++) b.fail();
    expect(b.tripped()).toBe(false); // 19 muestras: aún sin mínimo
    b.fail();
    expect(b.tripped()).toBe(true);
  });

  it("NO corta por ratio sin muestra mínima (3 de 5 fallando)", () => {
    const b = createSyncBreaker();
    b.ok();
    b.ok();
    b.fail();
    b.fail();
    b.fail();
    expect(b.tripped()).toBe(false);
  });

  it("corta por racha: 15 fallos consecutivos (formato roto desde el inicio)", () => {
    const b = createSyncBreaker();
    for (let i = 0; i < 14; i++) b.fail();
    expect(b.tripped()).toBe(false);
    b.fail();
    expect(b.tripped()).toBe(true);
  });

  it("un éxito resetea la racha de consecutivos", () => {
    const b = createSyncBreaker({ minSamples: 1000 }); // aísla la regla de racha
    for (let i = 0; i < 14; i++) b.fail();
    b.ok();
    for (let i = 0; i < 14; i++) b.fail();
    expect(b.tripped()).toBe(false);
  });

  it("summary describe el estado", () => {
    const b = createSyncBreaker();
    b.ok();
    b.fail();
    expect(b.summary()).toMatch(/1\/2 fallos \(50%\), 1 consecutivos/);
  });
});
