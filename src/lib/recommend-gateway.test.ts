import { describe, it, expect, vi } from "vitest";
import {
  callAiGateway,
  AI_GATEWAY_BUDGET_MS,
  AI_GATEWAY_MAX_ATTEMPT_MS,
} from "./recommend-gateway";

/** Respuesta OK cuyo cuerpo tarda `bodyMs` en poder leerse. */
function okConCuerpo(json: unknown, bodyMs = 0): Response {
  return {
    ok: true,
    status: 200,
    json: async () => {
      if (bodyMs > 0) await new Promise((res) => setTimeout(res, bodyMs));
      return json;
    },
    text: async () => JSON.stringify(json),
  } as unknown as Response;
}

function conStatus(status: number, body = "boom"): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

const base = { payload: "{}", apiKey: "k", siteUrl: "https://x.test", sleep: async () => {} };

describe("callAiGateway", () => {
  it("devuelve el JSON del modelo cuando el gateway responde bien", async () => {
    const fetchImpl = vi.fn(async () => okConCuerpo({ model: "m", choices: [] }));
    const r = await callAiGateway({ ...base, fetchImpl: fetchImpl as never });
    expect(r.ok).toBe(true);
    expect(r.ok && r.json.model).toBe("m");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("NO lanza si el cuerpo aborta al leerse: devuelve ok:false (era el 500 en producción)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        });
      },
      text: async () => "",
    })) as unknown as typeof fetch;

    const r = await callAiGateway({ ...base, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("aborted");
  });

  it("reintenta una vez ante 429 y devuelve el resultado del segundo intento", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(conStatus(429))
      .mockResolvedValueOnce(okConCuerpo({ model: "segundo" }));
    const r = await callAiGateway({ ...base, fetchImpl: fetchImpl as never });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.ok && r.json.model).toBe("segundo");
  });

  it("NO reintenta un 401: la key mala no se arregla repitiendo", async () => {
    const fetchImpl = vi.fn(async () => conStatus(401, "invalid key"));
    const r = await callAiGateway({ ...base, fetchImpl: fetchImpl as never });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("401");
  });

  it("reintenta un 500 del gateway", async () => {
    const fetchImpl = vi.fn(async () => conStatus(503));
    const r = await callAiGateway({ ...base, fetchImpl: fetchImpl as never });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
  });

  it("los dos intentos comparten presupuesto: el segundo no arranca si ya no queda tiempo", async () => {
    let t = 0;
    const now = () => t;
    // El primer intento consume TODO el presupuesto.
    const fetchImpl = vi.fn(async () => {
      t += AI_GATEWAY_BUDGET_MS;
      throw new Error("timeout simulado");
    }) as unknown as typeof fetch;

    const r = await callAiGateway({ ...base, fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("sin tiempo");
  });

  it("el timeout de un intento nunca pasa del tope por intento", async () => {
    const vistos: number[] = [];
    const real = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      vistos.push(ms);
      return real(ms);
    });
    const fetchImpl = vi.fn(async () => okConCuerpo({ model: "m" })) as unknown as typeof fetch;
    await callAiGateway({ ...base, fetchImpl, budgetMs: 120_000 });
    spy.mockRestore();
    expect(vistos[0]).toBeLessThanOrEqual(AI_GATEWAY_MAX_ATTEMPT_MS);
  });

  it("un fallo de red en los dos intentos degrada con el motivo del último", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("EAI_AGAIN"));
    const r = await callAiGateway({ ...base, fetchImpl: fetchImpl as never });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("EAI_AGAIN");
  });
});
