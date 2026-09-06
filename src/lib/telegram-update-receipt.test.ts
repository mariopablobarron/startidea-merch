import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { adminSetting: db } }));

import { claimTelegramUpdate, finishTelegramUpdate } from "./telegram-update-receipt";

const actor = { actorId: "123", chatId: "123", messageId: 88 };
const now = new Date("2026-09-05T12:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db.create.mockResolvedValue({});
  db.deleteMany.mockResolvedValue({ count: 0 });
  db.findUnique.mockResolvedValue(null);
  db.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("recibo Telegram · exclusión y retención", () => {
  it("reclama con clave única, identidad mínima y limpia solo recibos anteriores a 48 horas", async () => {
    const token = await claimTelegramUpdate(4321, actor);
    expect(token).toEqual(expect.any(String));
    expect(token!.length).toBeGreaterThan(0);
    expect(db.create).toHaveBeenCalledWith({ data: {
      key: "telegram_update:4321", value: { ...actor, status: "processing", token },
    } });
    expect(db.deleteMany).toHaveBeenCalledWith({ where: {
      key: { startsWith: "telegram_update:" },
      createdAt: { lt: new Date("2026-09-03T12:00:00.000Z") },
    } });
    expect(db.create.mock.invocationCallOrder[0]).toBeLessThan(db.deleteMany.mock.invocationCallOrder[0]);
  });

  it("dos entregas del mismo update solo tienen un ganador por la restricción única", async () => {
    const keys = new Set<string>();
    db.create.mockImplementation(async ({ data }: { data: { key: string } }) => {
      if (keys.has(data.key)) throw { code: "P2002" };
      keys.add(data.key);
      return {};
    });
    const results = await Promise.all([claimTelegramUpdate(4321, actor), claimTelegramUpdate(4321, actor)]);
    expect(results.filter((result) => typeof result === "string")).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(db.deleteMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error("P2002 aparece en un mensaje pero no es el código Prisma"),
    { code: "P1001", message: "Database unreachable" },
    null,
  ])("propaga fallos ajenos a la clave duplicada (%s)", async (error) => {
    db.create.mockRejectedValue(error);
    await expect(claimTelegramUpdate(4321, actor)).rejects.toBe(error);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("un fallo de limpieza no libera ni repite el claim que ya quedó guardado", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.deleteMany.mockRejectedValue(new Error("cleanup unavailable"));
    expect(await claimTelegramUpdate(4321, actor)).toEqual(expect.any(String));
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});

describe("recibo Telegram · recuperación ante reentrega tras interrupción", () => {
  const oldValue = { ...actor, status: "processing", token: "owner-before-crash" };

  beforeEach(() => { db.create.mockRejectedValue({ code: "P2002" }); });

  it.each([10 * 60_000, 10 * 60_000 + 1])("readquiere processing sin terminar desde hace %s ms con nuevo ownership", async (elapsed) => {
    const updatedAt = new Date(now.getTime() - elapsed);
    db.findUnique.mockResolvedValue({ value: oldValue, updatedAt });

    const token = await claimTelegramUpdate(4321, actor);

    expect(token).toEqual(expect.any(String));
    expect(token).not.toBe(oldValue.token);
    expect(db.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "telegram_update:4321" } }));
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { key: "telegram_update:4321", updatedAt, value: { equals: oldValue } },
      data: { value: { ...actor, status: "processing", token } },
    });
  });

  it("una consulta aún dentro de sus diez minutos no se readquiere", async () => {
    db.findUnique.mockResolvedValue({ value: oldValue, updatedAt: new Date(now.getTime() - 599_999) });
    expect(await claimTelegramUpdate(4321, actor)).toBeNull();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it.each(["answered", "failed", "undelivered"])("un recibo %s nunca vuelve a ejecutar el update", async (status) => {
    db.findUnique.mockResolvedValue({ value: { ...oldValue, status }, updatedAt: new Date(now.getTime() - 86_400_000) });
    expect(await claimTelegramUpdate(4321, actor)).toBeNull();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("un mensaje nuevo del mismo actor sigue pudiendo consultarse tras terminar el anterior", async () => {
    db.create.mockImplementation(async ({ data }: { data: { key: string } }) => {
      if (data.key === "telegram_update:4321") throw { code: "P2002" };
      return {};
    });
    db.findUnique.mockResolvedValue({ value: { ...oldValue, status: "answered" }, updatedAt: now });

    expect(await claimTelegramUpdate(4321, actor)).toBeNull();
    const nextActor = { ...actor, messageId: 89 };
    const nextToken = await claimTelegramUpdate(4322, nextActor);

    expect(nextToken).toEqual(expect.any(String));
    expect(db.create).toHaveBeenLastCalledWith({ data: {
      key: "telegram_update:4322", value: { ...nextActor, status: "processing", token: nextToken },
    } });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("dos recuperaciones que leyeron el mismo recibo solo consiguen un CAS ganador", async () => {
    const updatedAt = new Date(now.getTime() - 660_000);
    db.findUnique.mockResolvedValue({ value: oldValue, updatedAt });
    let storedValue: Record<string, unknown> = { ...oldValue };
    let storedTime = updatedAt;
    db.updateMany.mockImplementation(async ({ where, data }: {
      where: { key: string; updatedAt: Date; value: { equals: Record<string, unknown> } };
      data: { value: Record<string, unknown> };
    }) => {
      // Doble de persistencia: ambos handlers leen la misma versión; solo el
      // WHERE completo (valor Y fecha) puede sustituir esa versión una vez.
      expect(where.key).toBe("telegram_update:4321");
      expect(where.value.equals).toEqual(oldValue);
      expect(where.updatedAt).toEqual(updatedAt);
      if (JSON.stringify(where.value.equals) !== JSON.stringify(storedValue) ||
          where.updatedAt.getTime() !== storedTime.getTime()) return { count: 0 };
      storedValue = data.value;
      storedTime = now;
      return { count: 1 };
    });

    const tokens = await Promise.all([claimTelegramUpdate(4321, actor), claimTelegramUpdate(4321, actor)]);

    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(tokens.filter((token) => typeof token === "string")).toEqual([storedValue.token]);
    expect(tokens.filter((token) => token === null)).toHaveLength(1);
  });

  it("si otro proceso cambió el recibo entre lectura y CAS no obtiene ownership", async () => {
    db.findUnique.mockResolvedValue({ value: oldValue, updatedAt: new Date(now.getTime() - 660_000) });
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimTelegramUpdate(4321, actor)).toBeNull();
  });

  it("un fallo al leer el recibo duplicado se propaga para que el webhook devuelva 503", async () => {
    const error = new Error("read unavailable");
    db.findUnique.mockRejectedValue(error);
    await expect(claimTelegramUpdate(4321, actor)).rejects.toBe(error);
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});

describe("recibo Telegram · cierre trazable", () => {
  it.each(["answered", "failed", "undelivered"] as const)("conserva el actor y registra %s sin texto de mensajes", async (status) => {
    await finishTelegramUpdate(4321, actor, status, "current-owner");
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { key: "telegram_update:4321", value: { path: ["token"], equals: "current-owner" } },
      data: { value: { ...actor, status, token: "current-owner", finishedAt: now.toISOString() } },
    });
    expect(db.create).not.toHaveBeenCalled();
  });

  it("propaga el fallo al persistir el resultado para que el caller pueda registrarlo", async () => {
    const error = new Error("finish unavailable");
    db.updateMany.mockRejectedValue(error);
    await expect(finishTelegramUpdate(4321, actor, "answered", "current-owner")).rejects.toBe(error);
  });

  it("el proceso anterior al crash no puede cerrar el recibo que ya readquirió otro proceso", async () => {
    let value: Record<string, unknown> = { ...actor, status: "processing", token: "new-owner" };
    db.updateMany.mockImplementation(async ({ where, data }: {
      where: { key: string; value: { path: string[]; equals: string } };
      data: { value: Record<string, unknown> };
    }) => {
      expect(where.key).toBe("telegram_update:4321");
      expect(where.value.path).toEqual(["token"]);
      if (where.value.equals !== value.token) return { count: 0 };
      value = data.value;
      return { count: 1 };
    });

    await finishTelegramUpdate(4321, actor, "failed", "old-owner");
    expect(value).toEqual({ ...actor, status: "processing", token: "new-owner" });
    await finishTelegramUpdate(4321, actor, "answered", "new-owner");
    expect(value).toMatchObject({ ...actor, status: "answered", token: "new-owner" });
    await finishTelegramUpdate(4321, actor, "undelivered", "old-owner");
    expect(value).toMatchObject({ ...actor, status: "answered", token: "new-owner" });
  });
});
