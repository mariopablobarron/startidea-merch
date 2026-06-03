/**
 * Tests para POST /api/admin/team (crear admin).
 *
 * Mockea prisma + requireRole + hashPassword. NO testeamos GET por
 * simplicidad: es una findMany() trivial sin guardas extra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const requireRole = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  hashPassword: (...a: unknown[]) => hashPassword(...a),
}));

vi.mock("@/lib/admin-session", () => ({
  isAdmin: vi.fn().mockResolvedValue(true), // no usado en POST
}));

import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("https://test/api/admin/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  requireRole.mockReset();
  hashPassword.mockReset();
  // Por defecto: CEO autenticado
  requireRole.mockResolvedValue({
    ok: true,
    session: { userId: "ceo-1", email: "ceo@startidea.es", name: "CEO", role: "CEO" },
  });
  hashPassword.mockResolvedValue("hashed-password");
});

describe("POST /api/admin/team", () => {
  it("403 si no es CEO", async () => {
    requireRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "Rol insuficiente",
    });
    const res = await POST(
      makeReq({ email: "x@y.com", name: "X", role: "COMERCIAL" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Rol insuficiente" });
    expect(create).not.toHaveBeenCalled();
  });

  it("400 si email inválido", async () => {
    const res = await POST(makeReq({ email: "no-es-email", name: "X", role: "COMERCIAL" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Datos inválidos");
  });

  it("400 si role inválido", async () => {
    const res = await POST(
      makeReq({ email: "x@y.com", name: "X", role: "SUPERVISOR" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 si name vacío", async () => {
    const res = await POST(makeReq({ email: "x@y.com", name: "", role: "COMERCIAL" }));
    expect(res.status).toBe(400);
  });

  it("400 si JSON inválido", async () => {
    const req = new Request("https://test/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not-valid json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("409 si email ya existe", async () => {
    findUnique.mockResolvedValueOnce({ id: "existing", email: "x@y.com" });
    const res = await POST(makeReq({ email: "x@y.com", name: "X", role: "COMERCIAL" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("EMAIL_EN_USO");
    expect(create).not.toHaveBeenCalled();
  });

  it("crea admin + devuelve tempPassword + email lowercased", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({
      id: "u-new",
      email: "comercial@startidea.es",
      name: "Comercial",
      role: "COMERCIAL",
      active: true,
      lastLoginAt: null,
      createdAt: new Date("2026-06-03"),
    });
    const res = await POST(
      makeReq({
        email: "COMERCIAL@StartIdea.ES", // mayúsculas → lowercase
        name: "Comercial",
        role: "COMERCIAL",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe("comercial@startidea.es");
    expect(data.tempPassword).toBeTypeOf("string");
    expect(data.tempPassword.length).toBe(16); // 8 bytes hex
    expect(data.note).toMatch(/canal seguro/i);
    expect(hashPassword).toHaveBeenCalledWith(data.tempPassword);
  });

  it("crea CEO sin restricciones extras (CEO puede crear otro CEO)", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({
      id: "u-ceo2",
      email: "ceo2@startidea.es",
      name: "Otra CEO",
      role: "CEO",
      active: true,
      lastLoginAt: null,
      createdAt: new Date(),
    });
    const res = await POST(
      makeReq({ email: "ceo2@startidea.es", name: "Otra CEO", role: "CEO" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("CEO");
  });
});
