import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateCustomerRequest = vi.fn();
const customerUserFindUnique = vi.fn();
const customerUserUpdate = vi.fn();
const rateLimit = vi.fn();

vi.mock("@/lib/customer-auth", () => ({
  authenticateCustomerRequest: (...args: unknown[]) => authenticateCustomerRequest(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerUser: {
      findUnique: (...args: unknown[]) => customerUserFindUnique(...args),
      update: (...args: unknown[]) => customerUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}));

import { GET, PATCH } from "./route";

function request(method = "GET"): Request {
  return new Request("https://test/api/clientes/me", { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateCustomerRequest.mockResolvedValue(null);
  rateLimit.mockReturnValue({ ok: true });
});

describe("/api/clientes/me · contrato anónimo", () => {
  it("GET anónimo devuelve un estado público explícito sin consultar la BD", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authenticated: false,
      profile: null,
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(customerUserFindUnique).not.toHaveBeenCalled();
  });

  it("GET autenticado mantiene el perfil y marca la sesión", async () => {
    const profile = {
      email: "cliente@example.com",
      name: "Cliente",
      company: null,
      phone: null,
      taxId: null,
      billingAddress: null,
      shippingAddress: null,
    };
    authenticateCustomerRequest.mockResolvedValue({
      userId: "cus_1",
      email: profile.email,
      name: profile.name,
    });
    customerUserFindUnique.mockResolvedValue(profile);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      authenticated: true,
      profile,
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(customerUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: profile.email } }),
    );
  });

  it("una sesión válida sin usuario conserva 404 y nunca se cachea", async () => {
    authenticateCustomerRequest.mockResolvedValue({
      userId: "cus_deleted",
      email: "deleted@example.com",
      name: "",
    });
    customerUserFindUnique.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No encontrado" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("PATCH anónimo sigue protegido con 401", async () => {
    const response = await PATCH(request("PATCH"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No autenticado" });
    expect(customerUserUpdate).not.toHaveBeenCalled();
  });
});
