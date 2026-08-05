/**
 * Tests del cronómetro de bloqueo del bucle de eventos.
 *
 * Es instrumentación, así que lo que hay que fijar no es tanto que mida bien
 * como que **no cambie nada de lo que mide**: mismo valor de retorno, mismos
 * errores propagados, y sin ensuciar el log cuando no hay bloqueo real.
 */
import { describe, it, expect, vi } from "vitest";
import { blockingLogLine, measureSyncBlocking, BLOCKING_WARN_MS } from "./blocking-timer";

/** Reloj falso: cada llamada devuelve el siguiente valor de la lista. */
function fakeClock(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("blockingLogLine", () => {
  it("calla por debajo del umbral", () => {
    expect(blockingLogLine("x", BLOCKING_WARN_MS - 1)).toBeNull();
    expect(blockingLogLine("x", 0)).toBeNull();
  });

  it("avisa a partir del umbral, con la etiqueta y los ms redondeados", () => {
    const line = blockingLogLine("makito · parse XML productos", 12_345.6);
    expect(line).toContain("makito · parse XML productos");
    expect(line).toContain("12346 ms");
  });

  it("el umbral EXACTO ya avisa (frontera, no queda a interpretación)", () => {
    expect(blockingLogLine("x", BLOCKING_WARN_MS)).not.toBeNull();
  });

  it("un ms no finito no genera línea (no revienta el sync por un reloj raro)", () => {
    expect(blockingLogLine("x", NaN)).toBeNull();
    expect(blockingLogLine("x", Infinity)).toBeNull();
  });
});

describe("measureSyncBlocking", () => {
  it("devuelve EXACTAMENTE lo que devuelve la función medida", () => {
    const obj = { catalog: { product: [1, 2, 3] } };
    const out = measureSyncBlocking("x", () => obj, { now: fakeClock(0, 10), emit: vi.fn() });
    expect(out).toBe(obj);
  });

  it("no escribe nada si el bloqueo no llega al umbral", () => {
    const emit = vi.fn();
    measureSyncBlocking("x", () => 1, { now: fakeClock(1000, 1000 + BLOCKING_WARN_MS - 1), emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it("escribe una línea cuando el bloqueo es largo", () => {
    const emit = vi.fn();
    measureSyncBlocking("makito · parse XML productos", () => 1, {
      now: fakeClock(0, 8_400),
      emit,
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toContain("8400 ms");
  });

  it("propaga el error tal cual — la instrumentación no puede tragarse un fallo", () => {
    const boom = new Error("XML corrupto");
    expect(() =>
      measureSyncBlocking("x", () => {
        throw boom;
      }, { now: fakeClock(0, 12_000), emit: vi.fn() }),
    ).toThrow(boom);
  });

  it("mide también cuando la función lanza: ese tiempo se bloqueó igual", () => {
    const emit = vi.fn();
    try {
      measureSyncBlocking("makito · parse XML precios", () => {
        throw new Error("boom");
      }, { now: fakeClock(0, 12_000), emit });
    } catch {
      // esperado
    }
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toContain("12000 ms");
  });
});
