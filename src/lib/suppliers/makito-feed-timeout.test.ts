import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * El bug que vigila este test: un feed que acepta la conexión y luego gotea
 * dejaba el `fetch` colgado **para siempre**. La promesa del sync no se
 * resolvía ni se rechazaba, así que ni el `catch` del sync ni el `.catch()` de
 * su ruta llegaban a ejecutarse: en producción, 2 h sin una sola línea de log.
 */
describe("feeds XML de makito: descarga con tope de tiempo", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env.MAKITO_FEED_TOKEN = "token-de-prueba";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pasa un AbortSignal a TODAS las descargas de feed", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signals.push(init?.signal);
      return new Response(`<?xml version="1.0"?><root>${"x".repeat(200)}</root>`, {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const makito = await import("./makito");
    await makito.fetchProductsXml("esp");
    await makito.fetchPricesXml();
    await makito.fetchStockXml();

    expect(signals).toHaveLength(3);
    for (const signal of signals) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("el tope es finito y holgado: entre 1 y 30 min", async () => {
    const { FEED_TIMEOUT_MS } = await import("./makito");
    expect(FEED_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(FEED_TIMEOUT_MS).toBeLessThanOrEqual(30 * 60_000);
  });

  it("un feed que nunca responde acaba RECHAZANDO, no colgado", async () => {
    globalThis.fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Emula a undici: es el signal quien corta la espera infinita.
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
          );
        }),
    ) as unknown as typeof fetch;

    const makito = await import("./makito");
    const pending = makito.fetchProductsXml("esp");
    const signal = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]!.signal as AbortSignal;
    // Disparamos el abort que el timeout haría a los 10 min.
    (signal as AbortSignal & { dispatchEvent: (e: Event) => boolean }).dispatchEvent(
      new Event("abort"),
    );

    await expect(pending).rejects.toThrow(/aborted/i);
  });
});
