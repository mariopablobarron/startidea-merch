import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const apiKeyFindUnique = vi.fn();
const apiKeyUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: (...a: unknown[]) => apiKeyFindUnique(...a),
      update: (...a: unknown[]) => apiKeyUpdate(...a),
    },
  },
}));

import { createApiKey, authenticateApiKey, requireScope, type AuthResult } from "./api-auth";

/**
 * Tests de src/lib/api-auth.ts — la auth de la API PÚBLICA (Bearer), que
 * estaba a 0 tests siendo la puerta de entrada de integraciones externas.
 */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function reqCon(authorization?: string): Request {
  return new Request("https://x.test/api/v1/products", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  apiKeyFindUnique.mockReset();
  apiKeyUpdate.mockReset();
  apiKeyUpdate.mockResolvedValue({});
});

describe("createApiKey", () => {
  it("🔒 guarda el HASH, nunca la clave en claro", () => {
    const { plain, prefix, hash } = createApiKey();

    expect(hash).not.toContain(plain);
    expect(hash).toBe(sha256(plain));
    expect(hash).toHaveLength(64);
    // El prefijo identifica la clave en logs/BD sin revelar el secreto.
    expect(plain).toContain(prefix);
    expect(plain.slice(plain.indexOf(prefix) + prefix.length)).not.toBe("");
  });

  it("genera claves distintas en cada llamada", () => {
    const a = createApiKey();
    const b = createApiKey();

    expect(a.plain).not.toBe(b.plain);
    expect(a.prefix).not.toBe(b.prefix);
  });

  it("respeta el formato merch_live_<prefijo>_<secreto>", () => {
    const { plain, prefix } = createApiKey();
    expect(plain.startsWith(`merch_live_${prefix}_`)).toBe(true);
    expect(prefix).toHaveLength(8);
  });
});

describe("authenticateApiKey — rechazos antes de tocar la BD", () => {
  it.each([
    ["sin cabecera Authorization", undefined],
    ["cabecera vacía", ""],
    ["sin el esquema Bearer", "merch_live_abcd1234_secreto"],
    ["Bearer sin valor", "Bearer "],
    ["otro esquema", "Basic merch_live_abcd1234_secreto"],
  ])("401 %s, y no consulta la BD", async (_caso, header) => {
    const r = await authenticateApiKey(reqCon(header as string | undefined));

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 401 });
    expect(apiKeyFindUnique).not.toHaveBeenCalled();
  });

  it("401 si la clave no lleva el prefijo merch_live_", async () => {
    const r = await authenticateApiKey(reqCon("Bearer otra_cosa_abcd1234_x"));

    expect(r).toMatchObject({ ok: false, status: 401, reason: "Invalid key format" });
    expect(apiKeyFindUnique).not.toHaveBeenCalled();
  });

  it("401 si falta el separador entre prefijo y secreto", async () => {
    const r = await authenticateApiKey(reqCon("Bearer merch_live_sinseparador"));

    expect(r).toMatchObject({ ok: false, status: 401, reason: "Invalid key format" });
    expect(apiKeyFindUnique).not.toHaveBeenCalled();
  });
});

describe("authenticateApiKey — contra la BD", () => {
  it("autentica una clave válida y activa, y busca por el prefijo", async () => {
    const { plain, prefix, hash } = createApiKey();
    apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      label: "Integración X",
      secretHash: hash,
      active: true,
      scopes: ["products:read"],
    });

    const r = await authenticateApiKey(reqCon(`Bearer ${plain}`));

    expect(r).toEqual({
      ok: true,
      keyId: "key_1",
      label: "Integración X",
      scopes: ["products:read"],
    });
    expect(apiKeyFindUnique).toHaveBeenCalledWith({ where: { keyPrefix: prefix } });
  });

  it("401 si el prefijo no existe", async () => {
    const { plain } = createApiKey();
    apiKeyFindUnique.mockResolvedValue(null);

    expect(await authenticateApiKey(reqCon(`Bearer ${plain}`))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("🔒 401 si la clave está DESACTIVADA, aunque el secreto sea correcto", async () => {
    // Es lo que hace que revocar una clave sirva de algo.
    const { plain, hash } = createApiKey();
    apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      label: "Revocada",
      secretHash: hash,
      active: false,
      scopes: [],
    });

    expect(await authenticateApiKey(reqCon(`Bearer ${plain}`))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("🔒 401 si el prefijo es correcto pero el secreto NO", async () => {
    // Acertar el prefijo es fácil (sale en logs); el secreto es lo que vale.
    const legítima = createApiKey();
    const otra = createApiKey();
    apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      label: "L",
      secretHash: legítima.hash,
      active: true,
      scopes: [],
    });

    const forjada = `merch_live_${legítima.prefix}_${otra.plain.split("_").pop()}`;
    const r = await authenticateApiKey(reqCon(`Bearer ${forjada}`));

    expect(r).toMatchObject({ ok: false, status: 401, reason: "Key inválida" });
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });

  it("un fallo al anotar lastUsedAt no tumba la autenticación", async () => {
    // Es fire-and-forget a propósito: la telemetría no puede dejar sin
    // servicio a una integración.
    const { plain, hash } = createApiKey();
    apiKeyFindUnique.mockResolvedValue({
      id: "key_1",
      label: "L",
      secretHash: hash,
      active: true,
      scopes: [],
    });
    apiKeyUpdate.mockRejectedValue(new Error("BD caída"));

    expect((await authenticateApiKey(reqCon(`Bearer ${plain}`))).ok).toBe(true);
  });
});

describe("requireScope", () => {
  const autenticada = (scopes: string[]): AuthResult => ({
    ok: true,
    keyId: "key_1",
    label: "L",
    scopes,
  });

  it("deja pasar si la clave tiene el scope pedido", () => {
    expect(requireScope(autenticada(["products:read", "orders:read"]), "orders:read").ok).toBe(true);
  });

  it("403 si la clave tiene scopes pero no el pedido", () => {
    expect(requireScope(autenticada(["products:read"]), "orders:write")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("una clave SIN scopes lo puede todo (compatibilidad, deliberado)", () => {
    // Documentado en el módulo. Se fija aquí para que, si algún día se
    // cambia esa política, el cambio sea consciente y no un accidente.
    expect(requireScope(autenticada([]), "orders:write").ok).toBe(true);
  });

  it("🔒 propaga el rechazo previo sin convertirlo en ok", () => {
    const fallo: AuthResult = { ok: false, status: 401, reason: "Key inválida" };
    expect(requireScope(fallo, "products:read")).toEqual(fallo);
  });
});
