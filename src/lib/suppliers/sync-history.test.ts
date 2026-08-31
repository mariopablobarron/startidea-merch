import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const findMany = vi.fn();
const syncFindUnique = vi.fn();
const settingFind = vi.fn();
const settingUpsert = vi.fn();
const notifyTelegram = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplierSyncRun: {
      create: (...a: unknown[]) => create(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
    supplierSync: {
      findUnique: (...a: unknown[]) => syncFindUnique(...a),
    },
    adminSetting: {
      findUnique: (...a: unknown[]) => settingFind(...a),
      upsert: (...a: unknown[]) => settingUpsert(...a),
    },
  },
}));
vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...a: unknown[]) => notifyTelegram(...a),
}));

import {
  recordSupplierSyncRun,
  summarizeSupplierRuns,
  decideDegradationAlert,
  checkAndAlertSupplierDegradation,
  rescueOrphanedSyncRun,
} from "./sync-history";

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

describe("decideDegradationAlert (transiciones)", () => {
  it("sano→degradado: avisa", () => {
    expect(decideDegradationAlert(false, true)).toBe("degraded");
  });
  it("degradado→sano: avisa recuperación", () => {
    expect(decideDegradationAlert(true, false)).toBe("recovered");
  });
  it("degradado→degradado: NO repite (dedup)", () => {
    expect(decideDegradationAlert(true, true)).toBe("none");
  });
  it("sano→sano: nada", () => {
    expect(decideDegradationAlert(false, false)).toBe("none");
  });
});

describe("checkAndAlertSupplierDegradation", () => {
  beforeEach(() => {
    findMany.mockReset();
    settingFind.mockReset();
    settingUpsert.mockReset();
    notifyTelegram.mockReset();
    settingUpsert.mockResolvedValue({});
    notifyTelegram.mockResolvedValue(true);
  });

  const degradedRuns = [
    { supplier: "makito", durationMs: 900_000 }, // última, muy lenta
    { supplier: "makito", durationMs: 300_000 },
    { supplier: "makito", durationMs: 300_000 },
  ];
  const healthyRuns = [
    { supplier: "makito", durationMs: 300_000 },
    { supplier: "makito", durationMs: 300_000 },
    { supplier: "makito", durationMs: 300_000 },
  ];

  it("degradación nueva (no avisada antes) → avisa Y persiste el estado", async () => {
    findMany.mockResolvedValueOnce(degradedRuns);
    settingFind.mockResolvedValueOnce(null); // nunca avisado
    await checkAndAlertSupplierDegradation("makito");
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
    expect(notifyTelegram.mock.calls[0][0]).toContain("Sync degradado: makito");
    expect(settingUpsert.mock.calls[0][0].create.value).toBe(true);
  });

  it("ya avisada y sigue degradada → NO repite el aviso", async () => {
    findMany.mockResolvedValueOnce(degradedRuns);
    settingFind.mockResolvedValueOnce({ value: true });
    await checkAndAlertSupplierDegradation("makito");
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("estaba degradada y se recupera → avisa recuperación y persiste false", async () => {
    findMany.mockResolvedValueOnce(healthyRuns);
    settingFind.mockResolvedValueOnce({ value: true });
    await checkAndAlertSupplierDegradation("makito");
    expect(notifyTelegram.mock.calls[0][0]).toContain("Sync recuperado: makito");
    expect(settingUpsert.mock.calls[0][0].create.value).toBe(false);
  });

  it("<3 muestras → nunca avisa (evita ruido)", async () => {
    findMany.mockResolvedValueOnce([
      { supplier: "makito", durationMs: 900_000 },
      { supplier: "makito", durationMs: 10_000 },
    ]);
    settingFind.mockResolvedValueOnce(null);
    await checkAndAlertSupplierDegradation("makito");
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it("TELEMETRÍA: si la BD falla, NO propaga (no rompe el sync)", async () => {
    findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(checkAndAlertSupplierDegradation("makito")).resolves.toBeUndefined();
  });
});

describe("rescueOrphanedSyncRun", () => {
  beforeEach(() => {
    create.mockReset();
    syncFindUnique.mockReset();
  });

  const NOW = new Date("2026-09-02T04:02:00.000Z");
  const HACE_UN_DIA = new Date(NOW.getTime() - 24 * 3_600_000);

  it("registra en el histórico la ejecución que murió sin cerrar", async () => {
    syncFindUnique.mockResolvedValue({
      startedAt: HACE_UN_DIA,
      finishedAt: null,
      productsFetched: 10,
      productsUpserted: 8,
      notes: "fase 5/8 · stock",
    });
    create.mockResolvedValue({});

    await expect(rescueOrphanedSyncRun("makito", NOW)).resolves.toBe(true);

    const data = create.mock.calls[0][0].data;
    expect(data.supplier).toBe("makito");
    expect(data.ok).toBe(false);
    expect(data.productsUpserted).toBe(8);
    expect(JSON.stringify(data.errorsJson)).toContain("fase 5/8 · stock");
  });

  it("no escribe nada si la ejecución anterior cerró", async () => {
    syncFindUnique.mockResolvedValue({
      startedAt: HACE_UN_DIA,
      finishedAt: new Date(NOW.getTime() - 23 * 3_600_000),
      productsFetched: 10,
      productsUpserted: 10,
      notes: null,
    });
    await expect(rescueOrphanedSyncRun("makito", NOW)).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("la primera vez (sin fila previa) no inventa un fallo", async () => {
    syncFindUnique.mockResolvedValue(null);
    await expect(rescueOrphanedSyncRun("cifra", NOW)).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("si la BD no responde NO rompe el arranque del sync", async () => {
    // El catálogo del día importa más que su acta de defunción.
    syncFindUnique.mockRejectedValue(new Error("db caída"));
    await expect(rescueOrphanedSyncRun("midocean", NOW)).resolves.toBe(false);
  });
});

describe("ventana de tendencia", () => {
  beforeEach(() => {
    findMany.mockReset();
    settingFind.mockReset();
    settingUpsert.mockReset();
    notifyTelegram.mockReset();
  });

  it("solo mira ejecuciones correctas: una abortada no mide duración", async () => {
    findMany.mockResolvedValue([]);
    settingFind.mockResolvedValue(null);
    await checkAndAlertSupplierDegradation("makito");
    expect(findMany.mock.calls[0][0].where).toEqual({ ok: true });
  });
});
