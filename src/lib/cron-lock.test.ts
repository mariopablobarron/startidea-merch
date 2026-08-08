import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      create: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
        if (mocks.rows.has(data.key)) throw new Error("P2002");
        mocks.rows.set(data.key, structuredClone(data.value));
        return data;
      }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        mocks.rows.has(where.key) ? { value: structuredClone(mocks.rows.get(where.key)) } : null,
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { key: string; value: { equals: unknown } }; data: { value: unknown } }) => {
        const current = mocks.rows.get(where.key);
        if (JSON.stringify(current) !== JSON.stringify(where.value.equals)) return { count: 0 };
        mocks.rows.set(where.key, structuredClone(data.value));
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string; value: { equals: unknown } } }) => {
        const current = mocks.rows.get(where.key);
        if (JSON.stringify(current) !== JSON.stringify(where.value.equals)) return { count: 0 };
        mocks.rows.delete(where.key);
        return { count: 1 };
      }),
      delete: vi.fn(),
    },
  },
}));

import { acquireCronLockLease, releaseCronLockLease } from "./cron-lock";

beforeEach(() => mocks.rows.clear());

describe("cron lock con lease", () => {
  it("el dueño antiguo no borra el lock que otro proceso reclamó", async () => {
    const oldToken = await acquireCronLockLease("supplier-sync:cifra", 1);
    expect(oldToken).toBeTruthy();
    mocks.rows.set("cron_lock:supplier-sync:cifra", { at: Date.now(), token: "new-owner" });

    await releaseCronLockLease("supplier-sync:cifra", oldToken!);
    expect(mocks.rows.get("cron_lock:supplier-sync:cifra")).toMatchObject({ token: "new-owner" });
  });

  it("reclama un lease expirado y solo el token nuevo puede liberarlo", async () => {
    mocks.rows.set("cron_lock:supplier-sync:cifra", { at: 0, token: "expired" });
    const token = await acquireCronLockLease("supplier-sync:cifra", 1);
    expect(token).toBeTruthy();
    await releaseCronLockLease("supplier-sync:cifra", "expired");
    expect(mocks.rows.has("cron_lock:supplier-sync:cifra")).toBe(true);
    await releaseCronLockLease("supplier-sync:cifra", token!);
    expect(mocks.rows.has("cron_lock:supplier-sync:cifra")).toBe(false);
  });

  it("no roba un lease vigente", async () => {
    mocks.rows.set("cron_lock:supplier-sync:cifra", { at: Date.now(), token: "owner" });
    expect(await acquireCronLockLease("supplier-sync:cifra", 60_000)).toBeNull();
  });
});
