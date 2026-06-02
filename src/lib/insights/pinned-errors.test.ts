import { describe, it, expect, vi, beforeEach } from "vitest";

// Mockeamos prisma antes de importar el módulo
const findUnique = vi.fn();
const upsert = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: { findUnique: (...a: unknown[]) => findUnique(...a), upsert: (...a: unknown[]) => upsert(...a) },
    errorEvent: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

import {
  pinError,
  unpinError,
  getPinnedErrors,
  isPinned,
  cleanupResolvedPins,
} from "./pinned-errors";

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  findMany.mockReset();
});

describe("getPinnedErrors", () => {
  it("devuelve [] si no hay row", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await getPinnedErrors()).toEqual([]);
  });

  it("devuelve [] si value no es array (corrupto)", async () => {
    findUnique.mockResolvedValueOnce({ value: { not: "array" } });
    expect(await getPinnedErrors()).toEqual([]);
  });

  it("devuelve [] si BD lanza", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await getPinnedErrors()).toEqual([]);
  });

  it("devuelve el array tal cual cuando es válido", async () => {
    const pins = [
      { errorId: "e1", signature: "sig1", context: "ctx", message: "msg", pinnedAt: "2026-06-02T00:00:00Z" },
    ];
    findUnique.mockResolvedValueOnce({ value: pins });
    expect(await getPinnedErrors()).toEqual(pins);
  });
});

describe("pinError", () => {
  it("añade entry nueva al inicio del array", async () => {
    findUnique.mockResolvedValueOnce({ value: [] });
    upsert.mockResolvedValueOnce({});
    const result = await pinError({
      errorId: "e1",
      signature: "sig",
      context: "ctx",
      message: "msg",
    });
    expect(result).toHaveLength(1);
    expect(result[0].errorId).toBe("e1");
    expect(result[0].pinnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("actualiza entry existente en su sitio (no duplica)", async () => {
    const existing = [
      { errorId: "e1", signature: "old", context: "c1", message: "old-msg", pinnedAt: "2026-01-01T00:00:00Z" },
    ];
    findUnique.mockResolvedValueOnce({ value: existing });
    upsert.mockResolvedValueOnce({});
    const result = await pinError({
      errorId: "e1",
      signature: "new",
      context: "c1",
      message: "new-msg",
      note: "actualizada",
    });
    expect(result).toHaveLength(1);
    expect(result[0].signature).toBe("new");
    expect(result[0].note).toBe("actualizada");
    expect(result[0].pinnedAt).not.toBe("2026-01-01T00:00:00Z");
  });

  it("cap a 50 entries (más antiguas caen)", async () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      errorId: `e${i}`,
      signature: `s${i}`,
      context: "c",
      message: "m",
      pinnedAt: "2026-01-01T00:00:00Z",
    }));
    findUnique.mockResolvedValueOnce({ value: existing });
    upsert.mockResolvedValueOnce({});
    const result = await pinError({
      errorId: "new-one",
      signature: "n",
      context: "c",
      message: "m",
    });
    expect(result).toHaveLength(50);
    expect(result[0].errorId).toBe("new-one"); // se metió al principio
    // el último (e49) cae
    expect(result.find((p) => p.errorId === "e49")).toBeUndefined();
  });
});

describe("unpinError", () => {
  it("elimina entry y persiste", async () => {
    findUnique.mockResolvedValueOnce({
      value: [
        { errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" },
        { errorId: "e2", signature: "s", context: "c", message: "m", pinnedAt: "x" },
      ],
    });
    upsert.mockResolvedValueOnce({});
    const result = await unpinError("e1");
    expect(result).toHaveLength(1);
    expect(result[0].errorId).toBe("e2");
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("no hace nada si errorId no estaba", async () => {
    findUnique.mockResolvedValueOnce({
      value: [{ errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" }],
    });
    const result = await unpinError("nope");
    expect(result).toHaveLength(1);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("isPinned", () => {
  it("true si está", async () => {
    findUnique.mockResolvedValueOnce({
      value: [{ errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" }],
    });
    expect(await isPinned("e1")).toBe(true);
  });
  it("false si no está", async () => {
    findUnique.mockResolvedValueOnce({ value: [] });
    expect(await isPinned("e1")).toBe(false);
  });
});

describe("cleanupResolvedPins", () => {
  it("quita pins cuyo error fue resolved", async () => {
    findUnique.mockResolvedValueOnce({
      value: [
        { errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" },
        { errorId: "e2", signature: "s", context: "c", message: "m", pinnedAt: "x" },
      ],
    });
    findMany.mockResolvedValueOnce([
      { id: "e1", resolved: false },
      { id: "e2", resolved: true }, // este se quita
    ]);
    upsert.mockResolvedValueOnce({});
    const r = await cleanupResolvedPins();
    expect(r.removed).toBe(1);
    expect(r.remaining).toBe(1);
  });

  it("quita pins cuyo error ya no existe en BD", async () => {
    findUnique.mockResolvedValueOnce({
      value: [
        { errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" },
        { errorId: "e-ghost", signature: "s", context: "c", message: "m", pinnedAt: "x" },
      ],
    });
    findMany.mockResolvedValueOnce([
      { id: "e1", resolved: false },
      // e-ghost no aparece
    ]);
    upsert.mockResolvedValueOnce({});
    const r = await cleanupResolvedPins();
    expect(r.removed).toBe(1);
    expect(r.remaining).toBe(1);
  });

  it("no upsert si nada cambia", async () => {
    findUnique.mockResolvedValueOnce({
      value: [{ errorId: "e1", signature: "s", context: "c", message: "m", pinnedAt: "x" }],
    });
    findMany.mockResolvedValueOnce([{ id: "e1", resolved: false }]);
    const r = await cleanupResolvedPins();
    expect(r.removed).toBe(0);
    expect(r.remaining).toBe(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("vacío devuelve 0/0", async () => {
    findUnique.mockResolvedValueOnce({ value: [] });
    const r = await cleanupResolvedPins();
    expect(r).toEqual({ removed: 0, remaining: 0 });
  });
});
