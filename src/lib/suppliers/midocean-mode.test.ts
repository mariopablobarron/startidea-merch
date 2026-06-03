import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Import después de mockear
import {
  getMidoceanLiveOrders,
  setMidoceanLiveOrders,
  describeMidoceanLiveOrders,
} from "./midocean-mode";

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  delete process.env.MIDOCEAN_LIVE_ORDERS;
  // Forzar reset del cache módulo entre tests con timestamps lejanos
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
});

describe("getMidoceanLiveOrders — precedencia y fallback", () => {
  it("AdminSetting.true → true (incluso si env=false)", async () => {
    findUnique.mockResolvedValueOnce({ value: true });
    process.env.MIDOCEAN_LIVE_ORDERS = "false";
    expect(await getMidoceanLiveOrders()).toBe(true);
  });

  it("AdminSetting.false → false (incluso si env=true)", async () => {
    findUnique.mockResolvedValueOnce({ value: false });
    process.env.MIDOCEAN_LIVE_ORDERS = "true";
    vi.setSystemTime(new Date(2026, 0, 1, 1, 0, 0)); // avanzar 1h cache miss
    expect(await getMidoceanLiveOrders()).toBe(false);
  });

  it("AdminSetting ausente + env=true → true", async () => {
    findUnique.mockResolvedValueOnce(null);
    process.env.MIDOCEAN_LIVE_ORDERS = "true";
    vi.setSystemTime(new Date(2026, 0, 1, 2, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(true);
  });

  it("AdminSetting ausente + env ausente → false (default seguro)", async () => {
    findUnique.mockResolvedValueOnce(null);
    vi.setSystemTime(new Date(2026, 0, 1, 3, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(false);
  });

  it("BD lanza error → cae a env=true como fallback", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    process.env.MIDOCEAN_LIVE_ORDERS = "true";
    vi.setSystemTime(new Date(2026, 0, 1, 4, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(true);
  });

  it("AdminSetting.value de tipo extraño (string) → cae a env", async () => {
    findUnique.mockResolvedValueOnce({ value: "yes" });
    process.env.MIDOCEAN_LIVE_ORDERS = "true";
    vi.setSystemTime(new Date(2026, 0, 1, 5, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(true);
  });
});

describe("getMidoceanLiveOrders — cache 60s", () => {
  it("segunda llamada dentro de 60s no toca BD", async () => {
    findUnique.mockResolvedValueOnce({ value: true });
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    await getMidoceanLiveOrders();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 30)); // +30s
    await getMidoceanLiveOrders();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("tras 60s vuelve a BD", async () => {
    findUnique.mockResolvedValueOnce({ value: true });
    findUnique.mockResolvedValueOnce({ value: false });
    vi.setSystemTime(new Date(2026, 0, 1, 11, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(true);
    vi.setSystemTime(new Date(2026, 0, 1, 11, 1, 30)); // +90s
    expect(await getMidoceanLiveOrders()).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("setMidoceanLiveOrders", () => {
  it("upsert + invalida cache para que el siguiente get refleje", async () => {
    // Primer get cachea true
    findUnique.mockResolvedValueOnce({ value: true });
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(await getMidoceanLiveOrders()).toBe(true);

    // setMidoceanLiveOrders → upsert + invalida
    upsert.mockResolvedValueOnce({});
    findUnique.mockResolvedValueOnce({ value: false }); // siguiente get
    await setMidoceanLiveOrders(false);
    expect(upsert).toHaveBeenCalledOnce();

    // Get sin esperar 60s, debe re-pegar a BD por invalidación
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 5)); // sólo +5s
    expect(await getMidoceanLiveOrders()).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("describeMidoceanLiveOrders", () => {
  it("reporta fromBd + fromEnv + source AdminSetting si BD tiene valor", async () => {
    findUnique.mockResolvedValueOnce({ value: true });
    process.env.MIDOCEAN_LIVE_ORDERS = "false";
    const d = await describeMidoceanLiveOrders();
    expect(d.active).toBe(true);
    expect(d.source).toBe("AdminSetting");
    expect(d.fromBd).toBe(true);
    expect(d.fromEnv).toBe(false);
  });

  it("reporta source=env si BD no tiene valor", async () => {
    findUnique.mockResolvedValueOnce(null);
    process.env.MIDOCEAN_LIVE_ORDERS = "true";
    const d = await describeMidoceanLiveOrders();
    expect(d.active).toBe(true);
    expect(d.source).toBe("env");
    expect(d.fromBd).toBeNull();
    expect(d.fromEnv).toBe(true);
  });
});
