import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { supplierSyncRun: { create: (...a: unknown[]) => create(...a) } },
}));

import { recordSupplierSyncRun, summarizeSupplierRuns } from "./sync-history";

describe("summarizeSupplierRuns", () => {
  it("agrupa por proveedor y toma la última como la primera (más nueva)", () => {
    const t = summarizeSupplierRuns([
      { supplier: "makito", durationMs: 900_000 },
      { supplier: "makito", durationMs: 300_000 },
      { supplier: "cifra", durationMs: 5_000 },
    ]);
    expect(t.makito.lastMs).toBe(900_000);
    expect(t.makito.samples).toBe(2);
    expect(t.cifra.lastMs).toBe(5_000);
  });

  it("degraded=true cuando la última ≥2× la mediana y hay ≥3 muestras", () => {
    const t = summarizeSupplierRuns([
      { supplier: "makito", durationMs: 900_000 }, // última, muy lenta
      { supplier: "makito", durationMs: 300_000 },
      { supplier: "makito", durationMs: 280_000 },
      { supplier: "makito", durationMs: 300_000 },
    ]);
    expect(t.makito.medianMs).toBe(300_000);
    expect(t.makito.degraded).toBe(true);
  });

  it("NO marca degradación con menos de 3 muestras (evita ruido)", () => {
    const t = summarizeSupplierRuns([
      { supplier: "cifra", durationMs: 900_000 },
      { supplier: "cifra", durationMs: 10_000 },
    ]);
    expect(t.cifra.degraded).toBe(false);
  });

  it("una duración normal no dispara degradación", () => {
    const t = summarizeSupplierRuns([
      { supplier: "midocean", durationMs: 300_000 },
      { supplier: "midocean", durationMs: 290_000 },
      { supplier: "midocean", durationMs: 310_000 },
    ]);
    expect(t.midocean.degraded).toBe(false);
  });

  it("sin runs → objeto vacío", () => {
    expect(summarizeSupplierRuns([])).toEqual({});
  });
});

describe("recordSupplierSyncRun", () => {
  beforeEach(() => create.mockReset());

  it("escribe el run con durationMs calculado de startedAt/finishedAt", async () => {
    create.mockResolvedValueOnce({});
    await recordSupplierSyncRun({
      supplier: "makito",
      startedAt: new Date("2026-07-21T00:00:00Z"),
      finishedAt: new Date("2026-07-21T00:15:00Z"),
      ok: true,
      productsFetched: 4482,
      productsUpserted: 4482,
      errorsJson: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data.supplier).toBe("makito");
    expect(arg.data.durationMs).toBe(15 * 60 * 1000);
    expect(arg.data.ok).toBe(true);
    // array vacío de errores → DbNull, no []
    expect(Array.isArray(arg.data.errorsJson)).toBe(false);
  });

  it("guarda errores cuando los hay", async () => {
    create.mockResolvedValueOnce({});
    await recordSupplierSyncRun({
      supplier: "cifra",
      startedAt: new Date("2026-07-21T00:00:00Z"),
      finishedAt: new Date("2026-07-21T00:05:00Z"),
      ok: false,
      productsFetched: 10,
      productsUpserted: 5,
      errorsJson: [{ ref: "X", msg: "boom" }],
    });
    expect(create.mock.calls[0][0].data.errorsJson).toEqual([{ ref: "X", msg: "boom" }]);
  });

  it("TELEMETRÍA: si prisma falla, NO propaga el error (no rompe el sync)", async () => {
    create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordSupplierSyncRun({
        supplier: "midocean",
        startedAt: new Date(),
        finishedAt: new Date(),
        ok: true,
        productsFetched: 0,
        productsUpserted: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
