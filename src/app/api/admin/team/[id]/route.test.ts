/**
 * Tests para PATCH /api/admin/team/[id].
 * Cubre las guardas: SELF_MODIFY y LAST_CEO.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const count = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

import { PATCH } from "./route";

function makeReq(body: unknown): Request {
  return new Request("https://test/api/admin/team/u-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  count.mockReset();
  requireRole.mockReset();
  // Por defecto: CEO autenticado (id = ceo-1)
  requireRole.mockResolvedValue({
    ok: true,
    session: { userId: "ceo-1", email: "ceo@x.com", name: "CEO", role: "CEO" },
  });
});

describe("PATCH /api/admin/team/[id]", () => {
  it("403 si no es CEO", async () => {
    requireRole.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "Rol insuficiente",
    });
    const res = await PATCH(makeReq({ role: "COMERCIAL" }), makeParams("u-2"));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 SELF_MODIFY si target.id === session.userId", async () => {
    const res = await PATCH(makeReq({ active: false }), makeParams("ceo-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SELF_MODIFY");
    expect(update).not.toHaveBeenCalled();
  });

  it("400 si body vacío (Zod refine)", async () => {
    const res = await PATCH(makeReq({}), makeParams("u-2"));
    expect(res.status).toBe(400);
  });

  it("400 si role inválido", async () => {
    const res = await PATCH(makeReq({ role: "INVALID" }), makeParams("u-2"));
    expect(res.status).toBe(400);
  });

  it("404 si target no existe", async () => {
    findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ role: "COMERCIAL" }), makeParams("u-fantasma"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("NOT_FOUND");
  });

  it("cambia rol normal sin guardas extra", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-2",
      role: "COMERCIAL",
      active: true,
      name: "Comercial",
    });
    update.mockResolvedValueOnce({
      id: "u-2",
      email: "c@x.com",
      name: "Comercial",
      role: "FACTURACION",
      active: true,
      lastLoginAt: null,
      createdAt: new Date(),
    });
    const res = await PATCH(
      makeReq({ role: "FACTURACION" }),
      makeParams("u-2"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.role).toBe("FACTURACION");
    expect(count).not.toHaveBeenCalled(); // no se chequea last-CEO porque no era CEO
  });

  it("desactiva CEO si hay otro CEO activo", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-ceo2",
      role: "CEO",
      active: true,
      name: "Otra CEO",
    });
    count.mockResolvedValueOnce(1); // hay otro CEO activo (no es el que estamos modificando)
    update.mockResolvedValueOnce({
      id: "u-ceo2",
      email: "c2@x.com",
      name: "Otra CEO",
      role: "CEO",
      active: false,
      lastLoginAt: null,
      createdAt: new Date(),
    });
    const res = await PATCH(makeReq({ active: false }), makeParams("u-ceo2"));
    expect(res.status).toBe(200);
    expect((await res.json()).user.active).toBe(false);
  });

  it("400 LAST_CEO si target es último CEO activo y se desactivaría", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-ceo2",
      role: "CEO",
      active: true,
      name: "Otra CEO",
    });
    count.mockResolvedValueOnce(0); // no hay otro CEO activo
    const res = await PATCH(makeReq({ active: false }), makeParams("u-ceo2"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("LAST_CEO");
    expect(update).not.toHaveBeenCalled();
  });

  it("400 LAST_CEO si target es último CEO y se degradaría su rol", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-ceo2",
      role: "CEO",
      active: true,
      name: "Otra CEO",
    });
    count.mockResolvedValueOnce(0);
    const res = await PATCH(
      makeReq({ role: "COMERCIAL" }),
      makeParams("u-ceo2"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("LAST_CEO");
  });

  it("permite degradar CEO si hay otro CEO activo", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-ceo2",
      role: "CEO",
      active: true,
      name: "Otra CEO",
    });
    count.mockResolvedValueOnce(2); // 2 CEOs más activos
    update.mockResolvedValueOnce({
      id: "u-ceo2",
      email: "c2@x.com",
      name: "Otra CEO",
      role: "OPERACIONES",
      active: true,
      lastLoginAt: null,
      createdAt: new Date(),
    });
    const res = await PATCH(
      makeReq({ role: "OPERACIONES" }),
      makeParams("u-ceo2"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("OPERACIONES");
  });

  it("permite reactivar CEO inactivo (no aplica LAST_CEO porque ya estaba inactivo)", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-ceo2",
      role: "CEO",
      active: false, // ya estaba inactivo
      name: "Otra CEO",
    });
    update.mockResolvedValueOnce({
      id: "u-ceo2",
      email: "c2@x.com",
      name: "Otra CEO",
      role: "CEO",
      active: true,
      lastLoginAt: null,
      createdAt: new Date(),
    });
    const res = await PATCH(makeReq({ active: true }), makeParams("u-ceo2"));
    expect(res.status).toBe(200);
    expect(count).not.toHaveBeenCalled(); // no aplica guarda porque target no era CEO activo
  });
});
