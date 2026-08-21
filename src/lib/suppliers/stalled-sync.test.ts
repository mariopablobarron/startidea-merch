import { describe, it, expect } from "vitest";
import {
  detectStalledSyncs,
  stalledIssueName,
  STALLED_AFTER_HOURS,
  type SupplierSyncSnapshot,
} from "./stalled-sync";

const NOW = new Date("2026-08-21T16:00:00.000Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

describe("detectStalledSyncs", () => {
  it("caza el caso real de makito: abierto 12 h sin finishedAt", () => {
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "makito", startedAt: hoursAgo(12), finishedAt: null },
    ];
    expect(detectStalledSyncs(snapshots, NOW)).toEqual([
      { supplier: "makito", startedAt: hoursAgo(12).toISOString(), hoursRunning: 12 },
    ]);
  });

  it("un sync cerrado no es un problema, por viejo que sea", () => {
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "midocean", startedAt: hoursAgo(400), finishedAt: hoursAgo(399) },
    ];
    expect(detectStalledSyncs(snapshots, NOW)).toEqual([]);
  });

  it("un sync recién arrancado NO se avisa — si no, cantaría cada madrugada", () => {
    // El sync más largo medido (makito) dura ~14 min; a los 20 min sigue siendo
    // plausible que esté corriendo de verdad.
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "cifra", startedAt: new Date(NOW - 20 * 60_000), finishedAt: null },
    ];
    expect(detectStalledSyncs(snapshots, NOW)).toEqual([]);
  });

  it("el umbral es exclusivo: justo en la raya todavía no avisa", () => {
    const justo: SupplierSyncSnapshot[] = [
      { supplier: "cifra", startedAt: hoursAgo(STALLED_AFTER_HOURS), finishedAt: null },
    ];
    expect(detectStalledSyncs(justo, NOW)).toEqual([]);

    const pasado: SupplierSyncSnapshot[] = [
      { supplier: "cifra", startedAt: hoursAgo(STALLED_AFTER_HOURS + 0.5), finishedAt: null },
    ];
    expect(detectStalledSyncs(pasado, NOW)).toHaveLength(1);
  });

  it("ordena por gravedad: el que más lleva colgado, primero", () => {
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "cifra", startedAt: hoursAgo(3), finishedAt: null },
      { supplier: "makito", startedAt: hoursAgo(12), finishedAt: null },
      { supplier: "midocean", startedAt: hoursAgo(7), finishedAt: null },
    ];
    expect(detectStalledSyncs(snapshots, NOW).map((s) => s.supplier)).toEqual([
      "makito",
      "midocean",
      "cifra",
    ]);
  });

  it("una fecha ilegible no se convierte en aviso", () => {
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "adivin", startedAt: new Date("no-es-una-fecha"), finishedAt: null },
    ];
    expect(detectStalledSyncs(snapshots, NOW)).toEqual([]);
  });

  it("el umbral se puede subir para un proveedor lento sin tocar el detector", () => {
    const snapshots: SupplierSyncSnapshot[] = [
      { supplier: "makito", startedAt: hoursAgo(3), finishedAt: null },
    ];
    expect(detectStalledSyncs(snapshots, NOW)).toHaveLength(1);
    expect(detectStalledSyncs(snapshots, NOW, 6)).toEqual([]);
  });

  it("el nombre del issue no choca con el de un cron", () => {
    expect(stalledIssueName("makito")).toBe("sync:makito");
    expect(stalledIssueName("makito")).not.toBe("makito-sync");
  });
});
