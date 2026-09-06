import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireInFlight,
  inFlightCount,
  __resetInFlightForTests,
} from "./in-flight-limit";

describe("acquireInFlight", () => {
  beforeEach(() => __resetInFlightForTests());

  it("deja pasar hasta el máximo y rechaza la siguiente con 503 + Retry-After", async () => {
    const a = acquireInFlight({ key: "k", max: 1 });
    expect(a.ok).toBe(true);

    const b = acquireInFlight({ key: "k", max: 1 });
    expect(b.ok).toBe(false);
    if (b.ok) throw new Error("inalcanzable");
    expect(b.response.status).toBe(503);
    expect(b.response.headers.get("Retry-After")).toBe("30");
    const body = await b.response.json();
    expect(body.ok).toBe(false);
    expect(body.retryAfterSeconds).toBe(30);
  });

  it("al liberar, vuelve a dejar pasar", () => {
    const a = acquireInFlight({ key: "k", max: 1 });
    if (!a.ok) throw new Error("inalcanzable");
    expect(acquireInFlight({ key: "k", max: 1 }).ok).toBe(false);
    a.release();
    expect(acquireInFlight({ key: "k", max: 1 }).ok).toBe(true);
  });

  it("los buckets son independientes entre claves", () => {
    const a = acquireInFlight({ key: "uno", max: 1 });
    expect(a.ok).toBe(true);
    expect(acquireInFlight({ key: "dos", max: 1 }).ok).toBe(true);
  });

  it("un release repetido NO abre el cerrojo de más", () => {
    const a = acquireInFlight({ key: "k", max: 2 });
    const b = acquireInFlight({ key: "k", max: 2 });
    if (!a.ok || !b.ok) throw new Error("inalcanzable");
    expect(inFlightCount("k")).toBe(2);

    a.release();
    a.release();
    a.release();

    // Solo uno de los dos ha soltado: sigue habiendo uno en vuelo.
    expect(inFlightCount("k")).toBe(1);
  });

  it("una excepción en el trabajo caro no deja el cerrojo cerrado (patrón finally)", () => {
    const correr = () => {
      const slot = acquireInFlight({ key: "k", max: 1 });
      if (!slot.ok) throw new Error("ocupado");
      try {
        throw new Error("el handler ha reventado");
      } finally {
        slot.release();
      }
    };

    expect(correr).toThrow("el handler ha reventado");
    expect(inFlightCount("k")).toBe(0);
    // La siguiente petición pasa: es lo que se pierde si falta el `finally`.
    expect(acquireInFlight({ key: "k", max: 1 }).ok).toBe(true);
  });

  it("respeta un retryAfterSeconds propio", async () => {
    acquireInFlight({ key: "k", max: 1 });
    const b = acquireInFlight({ key: "k", max: 1, retryAfterSeconds: 90 });
    if (b.ok) throw new Error("inalcanzable");
    expect(b.response.headers.get("Retry-After")).toBe("90");
  });
});
