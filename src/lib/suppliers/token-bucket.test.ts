import { describe, it, expect } from "vitest";
import { createTokenBucket } from "./token-bucket";

describe("createTokenBucket", () => {
  it("arranca lleno", () => {
    const b = createTokenBucket({ capacity: 100, refillPerMinute: 25 });
    expect(b.status().tokens).toBe(100);
  });

  it("consume reduce tokens", async () => {
    const b = createTokenBucket({ capacity: 100, refillPerMinute: 25 });
    await b.consume();
    await b.consume();
    await b.consume();
    // El status también recarga un poquito por el tiempo transcurrido (probablemente 0 ya que ms)
    expect(b.status().tokens).toBeLessThanOrEqual(100);
    expect(b.status().tokens).toBeGreaterThanOrEqual(97);
  });

  it("refill respeta capacity (no excede)", () => {
    let mockNow = 1_000_000;
    const b = createTokenBucket({
      capacity: 100,
      refillPerMinute: 25,
      now: () => mockNow,
    });
    // Avanzar 10 minutos = debería rellenar 250 tokens pero cap a 100
    mockNow += 10 * 60_000;
    expect(b.status().tokens).toBe(100);
  });

  it("refill matemática: 25/min = ~0.4167 token/seg", () => {
    let mockNow = 1_000_000;
    const b = createTokenBucket({
      capacity: 100,
      refillPerMinute: 25,
      now: () => mockNow,
    });
    // Vaciar bucket manualmente
    b.__setStateForTesting!(0, mockNow);
    // Avanzar 60 segundos
    mockNow += 60_000;
    expect(b.status().tokens).toBe(25);
  });

  it("consume con bucket vacío llama sleep y reintenta", async () => {
    let mockNow = 1_000_000;
    let sleepCalls = 0;
    let lastSleepMs = 0;
    const b = createTokenBucket({
      capacity: 100,
      refillPerMinute: 25,
      now: () => mockNow,
      sleep: (ms) => {
        sleepCalls++;
        lastSleepMs = ms;
        mockNow += ms; // avanzar el reloj según pidió
        return Promise.resolve();
      },
    });
    b.__setStateForTesting!(0, mockNow);
    await b.consume();
    expect(sleepCalls).toBeGreaterThanOrEqual(1);
    // Para 1 token a 25/min → ~2400ms + 50ms cushion
    expect(lastSleepMs).toBeGreaterThan(2000);
    expect(lastSleepMs).toBeLessThan(3000);
  });

  it("100 consumes consecutivos sin sleep (capacidad inicial)", async () => {
    let mockNow = 1_000_000;
    let sleepCalls = 0;
    const b = createTokenBucket({
      capacity: 100,
      refillPerMinute: 25,
      now: () => mockNow,
      sleep: (ms) => {
        sleepCalls++;
        mockNow += ms;
        return Promise.resolve();
      },
    });
    for (let i = 0; i < 100; i++) {
      await b.consume();
    }
    expect(sleepCalls).toBe(0);
    // La 101ª sí esperaría
    await b.consume();
    expect(sleepCalls).toBeGreaterThanOrEqual(1);
  });

  it("status reporta refillPerMinute correctamente", () => {
    const b = createTokenBucket({ capacity: 50, refillPerMinute: 10 });
    const s = b.status();
    expect(s.capacity).toBe(50);
    expect(s.refillPerMinute).toBe(10);
  });
});
