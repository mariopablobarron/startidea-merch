/**
 * El reindex es la ÚNICA vía de reconstruir el índice sin lanzar un sync de
 * proveedor (que toca precios), así que lo que se prueba aquí es que no se
 * pueda disparar sin el secreto y que no se pisen dos a la vez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCronSecret = vi.fn();
const reindexAllProducts = vi.fn();
const meiliEnabled = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));
vi.mock("@/lib/search/meili", () => ({
  meiliEnabled: () => meiliEnabled(),
  reindexAllProducts: () => reindexAllProducts(),
}));
vi.mock("@/lib/cron-tracking", () => ({
  // Passthrough: la telemetría no es lo que se prueba aquí.
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));
vi.mock("@/lib/cron-lock", () => ({
  withCronLock: (key: string, fn: () => Promise<Response>) => withCronLock(key, fn),
}));

const withCronLock = vi.fn(
  async (_key: string, fn: () => Promise<Response>) => await fn(),
);

const req = () => new Request("https://x/api/cron/search-reindex", { method: "POST" });

beforeEach(() => {
  requireCronSecret.mockReset();
  reindexAllProducts.mockReset();
  meiliEnabled.mockReset();
  withCronLock.mockClear();
  requireCronSecret.mockReturnValue({ ok: true });
  meiliEnabled.mockReturnValue(true);
  reindexAllProducts.mockResolvedValue({ indexed: 9759 });
});

describe("POST /api/cron/search-reindex", () => {
  it("sin secreto no reindexa nada", async () => {
    requireCronSecret.mockReturnValue({ ok: false, status: 401, reason: "no autorizado" });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(reindexAllProducts).not.toHaveBeenCalled();
  });

  it("reindexa y devuelve cuántos documentos entraron", async () => {
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, indexed: 9759 });
    expect(withCronLock).toHaveBeenCalledWith("search-reindex", expect.any(Function));
  });

  it("sin Meilisearch configurado responde 503 y no toca la BD", async () => {
    meiliEnabled.mockReturnValue(false);
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(reindexAllProducts).not.toHaveBeenCalled();
    expect(withCronLock).not.toHaveBeenCalled();
  });

  it("un fallo del índice se reporta como 502, no como éxito", async () => {
    reindexAllProducts.mockRejectedValue(new Error("meili caído"));
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });
});
