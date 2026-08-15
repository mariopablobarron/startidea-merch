import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateCustomerRequest = vi.fn();
const favoriteFindMany = vi.fn();
const favoriteUpsert = vi.fn();
const favoriteDeleteMany = vi.fn();
const productFindUnique = vi.fn();
const rateLimit = vi.fn();

vi.mock("@/lib/customer-auth", () => ({
  authenticateCustomerRequest: (...args: unknown[]) => authenticateCustomerRequest(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerFavorite: {
      findMany: (...args: unknown[]) => favoriteFindMany(...args),
      upsert: (...args: unknown[]) => favoriteUpsert(...args),
      deleteMany: (...args: unknown[]) => favoriteDeleteMany(...args),
    },
    product: {
      findUnique: (...args: unknown[]) => productFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}));

import { DELETE, GET, POST } from "./route";

function request(method = "GET"): Request {
  return new Request("https://test/api/clientes/favorites", {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({ productId: "prod_1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateCustomerRequest.mockResolvedValue(null);
  rateLimit.mockReturnValue({ ok: true });
});

describe("/api/clientes/favorites · contrato anónimo", () => {
  it("GET anónimo devuelve una lista vacía explícita sin consultar la BD", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authenticated: false,
      ids: [],
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(favoriteFindMany).not.toHaveBeenCalled();
  });

  it("GET autenticado mantiene favoritos y marca la sesión", async () => {
    authenticateCustomerRequest.mockResolvedValue({
      userId: "cus_1",
      email: "Cliente@Example.com",
      name: "Cliente",
    });
    favoriteFindMany.mockResolvedValue([
      { productId: "prod_1" },
      { productId: "prod_2" },
    ]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authenticated: true,
      ids: ["prod_1", "prod_2"],
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(favoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "cliente@example.com" } }),
    );
  });

  it.each([
    ["POST", POST],
    ["DELETE", DELETE],
  ])("%s anónimo sigue protegido con 401", async (method, handler) => {
    const response = await handler(request(method));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No autenticado" });
    expect(favoriteUpsert).not.toHaveBeenCalled();
    expect(favoriteDeleteMany).not.toHaveBeenCalled();
    expect(productFindUnique).not.toHaveBeenCalled();
  });
});
