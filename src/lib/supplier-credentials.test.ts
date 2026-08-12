import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplierCredential: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { encryptSecret } from "./secret-box";
import {
  getStoredSupplierConfig,
  resolveCredentialField,
  setSupplierConfig,
} from "./supplier-credentials";

/**
 * Fallback a .env: la propiedad central de la Fase C — activar esto NUNCA
 * debe romper un sync que hoy funciona por variable de entorno.
 *
 * Cada test usa un SupplierCode DISTINTO — la caché en memoria del módulo es
 * compartida entre tests del mismo fichero (60s TTL), así que reusar el
 * mismo código haría que un test leyera el resultado cacheado de otro.
 */
describe("supplier-credentials", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "b".repeat(64);
    findUnique.mockReset();
    upsert.mockReset();
    update.mockReset();
  });

  it("sin fila en BD → resolveCredentialField devuelve el fallback de .env", async () => {
    findUnique.mockResolvedValue(null);
    const v = await resolveCredentialField("cifra", "token", "env-fallback-token");
    expect(v).toBe("env-fallback-token");
  });

  it("con fila en BD y campo presente → devuelve el valor descifrado, no el fallback", async () => {
    findUnique.mockResolvedValue({
      code: "makito",
      encryptedConfig: encryptSecret(JSON.stringify({ token: "token-real-en-bd" })),
    });
    const v = await resolveCredentialField("makito", "token", "env-fallback-token");
    expect(v).toBe("token-real-en-bd");
  });

  it("con fila en BD pero el campo pedido vacío/ausente → cae al fallback igual", async () => {
    findUnique.mockResolvedValue({
      code: "midocean",
      encryptedConfig: encryptSecret(JSON.stringify({ base: "https://api.cifrashop.com" })),
    });
    const v = await resolveCredentialField("midocean", "token", "env-fallback-token");
    expect(v).toBe("env-fallback-token");
  });

  it("descifrado roto (ENCRYPTION_KEY distinta a la que cifró) → degrada a null, NO tira el caller", async () => {
    const badBlob = encryptSecret(JSON.stringify({ token: "x" }));
    process.env.ENCRYPTION_KEY = "c".repeat(64); // clave distinta → falla el auth tag
    findUnique.mockResolvedValue({ code: "adivin", encryptedConfig: badBlob });
    const config = await getStoredSupplierConfig("adivin");
    expect(config).toBeNull();
  });

  it("setSupplierConfig cifra antes de guardar — el blob persistido no es el JSON en claro", async () => {
    await setSupplierConfig("cifra", { user: "x", pass: "y" }, "mario@startidea.es");
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.create.encryptedConfig).not.toContain("pass");
    expect(args.create.configKeys).toEqual(["user", "pass"]);
    expect(args.create.updatedBy).toBe("mario@startidea.es");
  });
});
