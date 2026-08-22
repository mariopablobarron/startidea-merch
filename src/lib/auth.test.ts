import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminSecret } from "./auth";

const ADMIN_SECRET = "a".repeat(64);

function jwt(claims: Record<string, unknown>, secret = ADMIN_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function requestWithAdminCookie(token: string): Request {
  return new Request("https://merchandising.startidea.es/api/admin/quotes", {
    headers: { cookie: `merch_admin=${token}` },
  });
}

describe("requireAdminSecret — cookie JWT admin legacy", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SECRET", ADMIN_SECRET);
    vi.stubEnv("ADMIN_JWT_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("acepta un JWT vigente con identidad y rol admin válidos", () => {
    const token = jwt({
      userId: "adm_1",
      email: "admin@startidea.es",
      role: "COMERCIAL",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(requireAdminSecret(requestWithAdminCookie(token))).toEqual({ ok: true });
  });

  it("rechaza un JWT de cliente aunque comparta la misma clave de firma", () => {
    const tokenDeCliente = jwt({
      userId: "cus_1",
      email: "cliente@ejemplo.com",
      name: "Cliente",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(requireAdminSecret(requestWithAdminCookie(tokenDeCliente))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it.each([
    { role: "SUPERADMIN", exp: Math.floor(Date.now() / 1000) + 3600 },
    { role: "CEO", exp: Math.floor(Date.now() / 1000) - 1 },
    { role: "CEO" },
  ])("rechaza rol inválido o caducidad ausente/caducada: %o", (extra) => {
    const token = jwt({ userId: "adm_1", email: "admin@startidea.es", ...extra });

    expect(requireAdminSecret(requestWithAdminCookie(token))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rechaza una firma de otra clave", () => {
    const token = jwt(
      {
        userId: "adm_1",
        email: "admin@startidea.es",
        role: "CEO",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      "b".repeat(64),
    );

    expect(requireAdminSecret(requestWithAdminCookie(token))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("mantiene la integración heredada por X-Admin-Secret", () => {
    const req = new Request("https://merchandising.startidea.es/api/admin/quotes", {
      headers: { "x-admin-secret": ADMIN_SECRET },
    });

    expect(requireAdminSecret(req)).toEqual({ ok: true });
  });

  it("mantiene la cookie HMAC v1 emitida antes de los JWT", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const signature = createHmac("sha256", ADMIN_SECRET)
      .update(`v1.${exp}`)
      .digest("base64url");

    expect(requireAdminSecret(requestWithAdminCookie(`v1.${exp}.${signature}`))).toEqual({
      ok: true,
    });
  });
});
