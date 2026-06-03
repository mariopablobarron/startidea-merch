/**
 * Tests para ping() y diagnoseProducts() del cliente Cifra.
 *
 * Mockeamos `fetch` global porque ambos llaman directamente al endpoint
 * remoto. Resto del módulo (parsers, COLOR_MAP) son lógica pura sin red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules(); // limpiar cache del módulo entre tests (lee process.env en import)
  process.env.CIFRA_API_TOKEN = "test-token-abc";
  process.env.CIFRA_API_BASE = "https://api.cifrashop.test";
  process.env.CIFRA_LANG = "es";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("ping()", () => {
  it("ok si HTTP 200 y array de productos", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify([{ model: "A-1", quantity: 5 }]),
    });
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemsSampled).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("test-token-abc");
  });

  it("error si token no configurado", async () => {
    delete process.env.CIFRA_API_TOKEN;
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no configurado/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error si HTTP 401", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "{}",
    });
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/401/);
  });

  it("error si respuesta no es JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "<html>maintenance</html>",
    });
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no JSON/);
  });

  it("error si respuesta JSON pero no array (object con error)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ error: "token expired" }),
    });
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no es array/);
  });

  it("error si fetch lanza (DNS, timeout)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
    const { ping } = await import("./cifra");
    const r = await ping();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ENOTFOUND/);
  });
});

describe("diagnoseProducts()", () => {
  it("reporta total + % stock + % precio correctamente", async () => {
    const fake = [
      { model: "A-1", rootmodel: "A", name: "Polo", quantity: 10, price_pvp: "5.50" },
      { model: "A-2", rootmodel: "A", name: "Polo", quantity: 0, price_pvp: "5.50" },
      { model: "B-1", rootmodel: "B", name: "Bolsa", quantity: 0, price_pvp: "0.00" },
      { model: "C-1", rootmodel: "C", name: "Llavero", quantity: 50, price_pvp: "0.30" },
    ];
    // diagnoseProducts llama fetchProducts via call() interno — devuelve JSON parseado.
    // call() hace JSON parse del body — tenemos que devolver JSON serializado.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fake,
    });
    const { diagnoseProducts } = await import("./cifra");
    const r = await diagnoseProducts(3);
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(4);
    expect(r.withStock).toBe(2); // A-1 y C-1
    expect(r.withZeroStock).toBe(2); // A-2 y B-1
    expect(r.withPrice).toBe(3); // A-1, A-2, C-1 (B-1 tiene "0.00")
    expect(r.sample).toHaveLength(3);
  });

  it("caso bug stock 0%: 100% productos con quantity=0", async () => {
    const fake = Array.from({ length: 10 }, (_, i) => ({
      model: `X-${i}`,
      rootmodel: "X",
      name: "Item",
      quantity: 0,
      price_pvp: "1.00",
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fake,
    });
    const { diagnoseProducts } = await import("./cifra");
    const r = await diagnoseProducts(5);
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(10);
    expect(r.withStock).toBe(0); // confirmación del bug
    expect(r.withZeroStock).toBe(10);
  });

  it("error si token ausente", async () => {
    delete process.env.CIFRA_API_TOKEN;
    const { diagnoseProducts } = await import("./cifra");
    const r = await diagnoseProducts();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no configurado/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error si fetch lanza", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const { diagnoseProducts } = await import("./cifra");
    const r = await diagnoseProducts();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/network down/);
  });

  it("sampleSize respeta el límite incluso si hay menos productos", async () => {
    const fake = [
      { model: "A-1", rootmodel: "A", name: "X", quantity: 1, price_pvp: "1.00" },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fake,
    });
    const { diagnoseProducts } = await import("./cifra");
    const r = await diagnoseProducts(10);
    expect(r.sample).toHaveLength(1);
  });
});
