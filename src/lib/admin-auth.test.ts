import { describe, it, expect, vi } from "vitest";
import { SignJWT } from "jose";

vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: vi.fn() }, adminLoginEvent: { create: vi.fn() } },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

/**
 * Tests de src/lib/admin-auth.ts — el guardián del PANEL, que estaba a 0
 * tests. Cubre la escalada de privilegio cliente→admin.
 *
 * ⚠️ El secreto se resuelve al importar el módulo, así que el env se fija
 * antes de un import dinámico (un `beforeAll` aquí sería decorativo).
 * Se usa SOLO `ADMIN_SECRET`: la configuración REAL de producción, donde
 * los tres tipos de token comparten clave de firma.
 */

const ADMIN_SECRET = "s".repeat(64);

async function loadModule() {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  delete process.env.ADMIN_JWT_SECRET;
  delete process.env.CUSTOMER_JWT_SECRET;
  vi.resetModules();
  return import("./admin-auth");
}

async function firmarConClaims(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(ADMIN_SECRET));
}

/** Lo que firma de verdad /api/clientes/auth/consume para un cliente. */
const CLAIMS_DE_CLIENTE = {
  userId: "cus_1",
  email: "cliente@ejemplo.com",
  name: "Cliente Cualquiera",
};

describe("verifySession — camino legítimo", () => {
  it("acepta la sesión de admin que firma la propia app, con su rol", async () => {
    const { signSession, verifySession } = await loadModule();
    const token = await signSession({
      userId: "adm_1",
      email: "admin@startidea.es",
      name: "Admin",
      role: "COMERCIAL",
    });

    expect(await verifySession(token)).toEqual({
      userId: "adm_1",
      email: "admin@startidea.es",
      name: "Admin",
      role: "COMERCIAL",
    });
  });

  it.each(["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"] as const)(
    "acepta el rol real %s (ninguno se queda fuera)",
    async (role) => {
      const { signSession, verifySession } = await loadModule();
      const token = await signSession({ userId: "a", email: "a@b.es", name: "A", role });
      expect((await verifySession(token))?.role).toBe(role);
    },
  );
});

describe("🔴 verifySession — escalada de privilegio cliente→admin", () => {
  it("🔒 un token de CLIENTE en la cookie de admin NO es sesión de admin", async () => {
    // El vector real: cualquiera pide presupuesto con su email, recibe el
    // magic-link y obtiene este token — firmado con el MISMO ADMIN_SECRET.
    // Antes salía de aquí como {..., role: undefined}, objeto TRUTHY, y los
    // ~80 endpoints admin que solo comprueban que HAYA sesión lo aceptaban.
    const { verifySession } = await loadModule();
    const tokenDeCliente = await firmarConClaims(CLAIMS_DE_CLIENTE);

    expect(await verifySession(tokenDeCliente)).toBeNull();
  });

  it("🔒 tampoco por la vía de authenticateAdminRequest (cookie en la petición)", async () => {
    const { authenticateAdminRequest } = await loadModule();
    const tokenDeCliente = await firmarConClaims(CLAIMS_DE_CLIENTE);
    const req = new Request("https://x.test/api/admin/quotes", {
      headers: { cookie: `merch_admin=${tokenDeCliente}` },
    });

    expect(await authenticateAdminRequest(req)).toBeNull();
  });

  it("🔒 y por tanto requireAdminSession responde 401, no deja pasar", async () => {
    // Es la comprobación que hacen ~80 rutas admin: si esta se cuela, se
    // cuelan todas ellas (costes, márgenes, nombres de proveedor).
    const { requireAdminSession } = await loadModule();
    const tokenDeCliente = await firmarConClaims(CLAIMS_DE_CLIENTE);
    const req = new Request("https://x.test/api/admin/quotes", {
      headers: { cookie: `merch_admin=${tokenDeCliente}` },
    });

    expect(await requireAdminSession(req)).toMatchObject({ ok: false, status: 401 });
  });

  it("🔒 un token de AFILIADO tampoco vale como admin", async () => {
    const { verifySession } = await loadModule();
    expect(await verifySession(await firmarConClaims({ partnerId: "p1" }))).toBeNull();
  });

  it("🔒 no se puede AUTOPROCLAMAR un rol que no existe", async () => {
    const { verifySession } = await loadModule();
    const forjado = await firmarConClaims({ ...CLAIMS_DE_CLIENTE, role: "SUPERADMIN" });

    expect(await verifySession(forjado)).toBeNull();
  });

  it("🔒 rechaza rol presente pero vacío", async () => {
    const { verifySession } = await loadModule();
    expect(await verifySession(await firmarConClaims({ ...CLAIMS_DE_CLIENTE, role: "" }))).toBeNull();
  });
});

describe("verifySession — rechazos básicos", () => {
  it("rechaza firma de otro secreto, token caducado y basura", async () => {
    const { verifySession } = await loadModule();

    const otroSecreto = await new SignJWT({ userId: "a", email: "b@c.es", role: "CEO" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode("x".repeat(64)));
    const caducado = await new SignJWT({ userId: "a", email: "b@c.es", role: "CEO" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(ADMIN_SECRET));

    expect(await verifySession(otroSecreto)).toBeNull();
    expect(await verifySession(caducado)).toBeNull();
    expect(await verifySession("basura")).toBeNull();
  });
});

describe("authenticateAdminRequest — vía legacy X-Admin-Secret", () => {
  it("el secreto legacy correcto entra como CEO", async () => {
    const { authenticateAdminRequest } = await loadModule();
    const req = new Request("https://x.test/", {
      headers: { "x-admin-secret": ADMIN_SECRET },
    });

    expect(await authenticateAdminRequest(req)).toMatchObject({ role: "CEO" });
  });

  it("🔒 un secreto legacy incorrecto no entra", async () => {
    const { authenticateAdminRequest } = await loadModule();
    const req = new Request("https://x.test/", { headers: { "x-admin-secret": "no" } });

    expect(await authenticateAdminRequest(req)).toBeNull();
  });

  it("sin cookie ni cabecera, no hay sesión", async () => {
    const { authenticateAdminRequest } = await loadModule();
    expect(await authenticateAdminRequest(new Request("https://x.test/"))).toBeNull();
  });
});

describe("requireRole", () => {
  async function reqConRol(role: "CEO" | "COMERCIAL" | "FACTURACION" | "OPERACIONES") {
    const { signSession } = await loadModule();
    const token = await signSession({ userId: "a", email: "a@b.es", name: "A", role });
    return new Request("https://x.test/", { headers: { cookie: `merch_admin=${token}` } });
  }

  it("CEO pasa siempre, aunque no esté en la lista permitida", async () => {
    const { requireRole } = await loadModule();
    expect((await requireRole(await reqConRol("CEO"), "OPERACIONES")).ok).toBe(true);
  });

  it("deja pasar el rol permitido y rechaza con 403 el que no lo está", async () => {
    const { requireRole } = await loadModule();
    expect((await requireRole(await reqConRol("FACTURACION"), "FACTURACION")).ok).toBe(true);
    expect(await requireRole(await reqConRol("OPERACIONES"), "FACTURACION")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("🔒 sin sesión devuelve 401, no 403 — no se confunde 'quién eres' con 'qué puedes'", async () => {
    const { requireRole } = await loadModule();
    expect(await requireRole(new Request("https://x.test/"), "CEO")).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe("cookie de sesión admin", () => {
  it("es HttpOnly, SameSite=Lax y dura 8 h; la de cierre caduca ya", async () => {
    const { sessionCookieValue, clearSessionCookieValue } = await loadModule();

    const cookie = sessionCookieValue("tok");
    expect(cookie).toContain("merch_admin=tok");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=28800");

    expect(clearSessionCookieValue()).toContain("Max-Age=0");
  });
});

describe("sin secreto configurado", () => {
  it("🔒 no valida nada y firmar lanza (no cae a un literal)", async () => {
    const token = await firmarConClaims({ userId: "a", email: "b@c.es", role: "CEO" });
    delete process.env.ADMIN_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    vi.resetModules();
    const { verifySession, signSession } = await import("./admin-auth");

    expect(await verifySession(token)).toBeNull();
    await expect(
      signSession({ userId: "a", email: "b@c.es", name: "A", role: "CEO" }),
    ).rejects.toThrow();

    process.env.ADMIN_SECRET = ADMIN_SECRET;
  });
});
