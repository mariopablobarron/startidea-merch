import { describe, it, expect } from "vitest";
import {
  describeOrphanedSync,
  ORPHAN_ERROR_REF,
  type PreviousSyncRow,
} from "./orphan-sync";
import { STALLED_AFTER_HOURS } from "./stalled-sync";

const NOW = new Date("2026-09-02T04:02:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function row(over: Partial<PreviousSyncRow> = {}): PreviousSyncRow {
  return {
    startedAt: hoursAgo(24),
    finishedAt: null,
    productsFetched: 4_500,
    productsUpserted: 4_479,
    notes: null,
    ...over,
  };
}

describe("describeOrphanedSync", () => {
  it("sin fila previa no hay nada que rescatar", () => {
    expect(describeOrphanedSync(null, NOW)).toBeNull();
  });

  it("una fila cerrada ya tiene su run en el histórico", () => {
    expect(
      describeOrphanedSync(row({ finishedAt: hoursAgo(23.8) }), NOW),
    ).toBeNull();
  });

  it("una fila cerrada CON FALLO tampoco se duplica", () => {
    // `withSyncFailureClosing` la cerró con ok=false: su run ya está escrito.
    expect(
      describeOrphanedSync(row({ finishedAt: hoursAgo(23.9) }), NOW),
    ).toBeNull();
  });

  it("una fila abierta RECIENTE puede ser un sync vivo: no se toca", () => {
    // Justo por debajo del umbral — dar por muerto lo que corre inventaría
    // un fallo y, peor, ensuciaría el histórico con una duración falsa.
    const casi = STALLED_AFTER_HOURS - 0.1;
    expect(describeOrphanedSync(row({ startedAt: hoursAgo(casi) }), NOW)).toBeNull();
  });

  it("el umbral es el mismo que el del detector en caliente", () => {
    expect(
      describeOrphanedSync(row({ startedAt: hoursAgo(STALLED_AFTER_HOURS) }), NOW),
    ).toBeNull();
    expect(
      describeOrphanedSync(row({ startedAt: hoursAgo(STALLED_AFTER_HOURS + 0.1) }), NOW),
    ).not.toBeNull();
  });

  it("una fecha de arranque ilegible no se convierte en aviso", () => {
    expect(
      describeOrphanedSync(row({ startedAt: new Date("no-es-fecha") }), NOW),
    ).toBeNull();
  });

  it("una fila abierta y vieja se registra como ejecución muerta", () => {
    const orphan = describeOrphanedSync(row(), NOW);
    expect(orphan).not.toBeNull();
    expect(orphan!.ok).toBe(false);
    expect(orphan!.startedAt).toEqual(hoursAgo(24));
    // `finishedAt` es ESTE arranque: la duración es un tope superior.
    expect(orphan!.finishedAt).toEqual(NOW);
    expect(orphan!.errorsJson[0].ref).toBe(ORPHAN_ERROR_REF);
  });

  it("conserva lo que la ejecución muerta SÍ llegó a hacer", () => {
    const orphan = describeOrphanedSync(row(), NOW)!;
    expect(orphan.productsFetched).toBe(4_500);
    expect(orphan.productsUpserted).toBe(4_479);
  });

  it("rescata la fase anotada, que el arranque siguiente borra", () => {
    const orphan = describeOrphanedSync(row({ notes: "fase 5/8 · stock" }), NOW)!;
    expect(orphan.errorsJson[0].message).toContain("fase 5/8 · stock");
  });

  it("sin fase anotada lo dice, en vez de callar", () => {
    const orphan = describeOrphanedSync(row({ notes: "   " }), NOW)!;
    expect(orphan.errorsJson[0].message).toContain("sin fase anotada");
  });

  it("el mensaje cabe en la columna aunque la fase sea absurda", () => {
    const orphan = describeOrphanedSync(row({ notes: "x".repeat(2_000) }), NOW)!;
    expect(orphan.errorsJson[0].message.length).toBeLessThanOrEqual(500);
  });
});
