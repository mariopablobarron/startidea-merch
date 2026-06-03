/**
 * Tests para el state management del cliente Makito B2B:
 *   - getMakitoB2BMode / setMakitoB2BMode  (con caché token interna)
 *   - getActiveCredentials  (precedencia mode + env vars)
 *
 * Las funciones que hacen fetch real (loginB2B, fetchB2B, getCountries…)
 * NO se testean aquí porque dependen de la red. El rate limiter ya está
 * cubierto en token-bucket.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  findUnique.mockReset();
  upsert.mockReset();
  // Limpiar las 4 vars que controla el módulo
  delete process.env.MAKITO_B2B_SANDBOX_CLIENT_ID;
  delete process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET;
  delete process.env.MAKITO_B2B_PROD_CLIENT_ID;
  delete process.env.MAKITO_B2B_PROD_CLIENT_SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getMakitoB2BMode — fallback seguro a sandbox", () => {
  it("AdminSetting='sandbox' → sandbox", async () => {
    findUnique.mockResolvedValueOnce({ value: "sandbox" });
    const { getMakitoB2BMode } = await import("./makito-b2b");
    expect(await getMakitoB2BMode()).toBe("sandbox");
  });

  it("AdminSetting='production' → production", async () => {
    findUnique.mockResolvedValueOnce({ value: "production" });
    const { getMakitoB2BMode } = await import("./makito-b2b");
    expect(await getMakitoB2BMode()).toBe("production");
  });

  it("AdminSetting con valor inválido → sandbox (seguro)", async () => {
    findUnique.mockResolvedValueOnce({ value: "live" });
    const { getMakitoB2BMode } = await import("./makito-b2b");
    expect(await getMakitoB2BMode()).toBe("sandbox");
  });

  it("AdminSetting ausente → sandbox (default)", async () => {
    findUnique.mockResolvedValueOnce(null);
    const { getMakitoB2BMode } = await import("./makito-b2b");
    expect(await getMakitoB2BMode()).toBe("sandbox");
  });

  it("BD lanza error → sandbox (fallback seguro)", async () => {
    findUnique.mockRejectedValueOnce(new Error("connection refused"));
    const { getMakitoB2BMode } = await import("./makito-b2b");
    expect(await getMakitoB2BMode()).toBe("sandbox");
  });
});

describe("setMakitoB2BMode", () => {
  it("upsert con shape correcto", async () => {
    findUnique.mockResolvedValueOnce({ value: "sandbox" });
    upsert.mockResolvedValueOnce({});
    const { setMakitoB2BMode } = await import("./makito-b2b");
    await setMakitoB2BMode("production");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "makito_b2b_mode" },
        create: { key: "makito_b2b_mode", value: "production" },
        update: { value: "production" },
      }),
    );
  });
});

describe("getActiveCredentials — precedencia modo + env vars", () => {
  it("sandbox + sandbox vars presentes → sandbox creds", async () => {
    process.env.MAKITO_B2B_SANDBOX_CLIENT_ID = "sb-id";
    process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET = "sb-secret";
    process.env.MAKITO_B2B_PROD_CLIENT_ID = "prod-id";
    process.env.MAKITO_B2B_PROD_CLIENT_SECRET = "prod-secret";
    findUnique.mockResolvedValueOnce({ value: "sandbox" });
    const { getActiveCredentials } = await import("./makito-b2b");
    const creds = await getActiveCredentials();
    expect(creds.mode).toBe("sandbox");
    expect(creds.clientId).toBe("sb-id");
    expect(creds.clientSecret).toBe("sb-secret");
  });

  it("production + prod vars presentes → prod creds", async () => {
    process.env.MAKITO_B2B_SANDBOX_CLIENT_ID = "sb-id";
    process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET = "sb-secret";
    process.env.MAKITO_B2B_PROD_CLIENT_ID = "prod-id";
    process.env.MAKITO_B2B_PROD_CLIENT_SECRET = "prod-secret";
    findUnique.mockResolvedValueOnce({ value: "production" });
    const { getActiveCredentials } = await import("./makito-b2b");
    const creds = await getActiveCredentials();
    expect(creds.mode).toBe("production");
    expect(creds.clientId).toBe("prod-id");
    expect(creds.clientSecret).toBe("prod-secret");
  });

  it("sandbox + sandbox vars ausentes → throw con mensaje claro", async () => {
    findUnique.mockResolvedValueOnce({ value: "sandbox" });
    const { getActiveCredentials } = await import("./makito-b2b");
    await expect(getActiveCredentials()).rejects.toThrow(/sandbox.*no configuradas/i);
  });

  it("production + prod vars ausentes → throw mencionando PROD", async () => {
    findUnique.mockResolvedValueOnce({ value: "production" });
    const { getActiveCredentials } = await import("./makito-b2b");
    await expect(getActiveCredentials()).rejects.toThrow(/PROD/);
  });

  it("sandbox con solo CLIENT_ID (sin SECRET) → throw", async () => {
    process.env.MAKITO_B2B_SANDBOX_CLIENT_ID = "sb-id";
    // SECRET intencional ausente
    findUnique.mockResolvedValueOnce({ value: "sandbox" });
    const { getActiveCredentials } = await import("./makito-b2b");
    await expect(getActiveCredentials()).rejects.toThrow();
  });
});
