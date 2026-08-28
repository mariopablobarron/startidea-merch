import { describe, it, expect, vi } from "vitest";
import {
  closeFailedSync,
  syncFailureMessage,
  withSyncFailureClosing,
  SyncTimeoutError,
  SYNC_TIMEOUT_MS,
  type FailedSyncRow,
} from "./sync-failure";

function fakeWriter(impl?: () => Promise<unknown>) {
  const rows: FailedSyncRow[] = [];
  const write = vi.fn(async (row: FailedSyncRow) => {
    rows.push(row);
    return impl ? impl() : {};
  });
  return { write, rows };
}

describe("syncFailureMessage", () => {
  it("usa el message de un Error", () => {
    expect(syncFailureMessage(new Error("feed caído"))).toBe("feed caído");
  });

  it("convierte a texto lo que no es Error", () => {
    expect(syncFailureMessage({ raro: true })).toContain("object");
  });

  it("recorta para no reventar la columna JSON", () => {
    expect(syncFailureMessage(new Error("x".repeat(2000)))).toHaveLength(500);
  });
});

describe("closeFailedSync", () => {
  it("cierra la fila con finishedAt, ok=false y el motivo", async () => {
    const { write, rows } = fakeWriter();
    const now = new Date("2026-08-22T04:13:00.000Z");

    const written = await closeFailedSync(write, new Error("XML a medias"), now);

    expect(written).toBe(true);
    expect(rows).toEqual([
      {
        finishedAt: now,
        ok: false,
        errorsJson: [{ ref: "_abortado", message: "XML a medias" }],
      },
    ]);
  });

  it("finishedAt SIEMPRE queda puesto — es lo que distingue fallado de colgado", async () => {
    const { write, rows } = fakeWriter();
    await closeFailedSync(write, new Error("boom"));
    expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
    expect(rows[0]?.ok).toBe(false);
  });

  it("no lanza si la BD tampoco responde: el error que importa es el original", async () => {
    const { write } = fakeWriter(async () => {
      throw new Error("db caída");
    });
    await expect(closeFailedSync(write, new Error("boom"))).resolves.toBe(false);
  });
});

describe("withSyncFailureClosing", () => {
  it("deja pasar el éxito sin tocar la fila (la cierra el propio sync)", async () => {
    const { write, rows } = fakeWriter();
    const result = await withSyncFailureClosing("makito-sync", write, async () => "hecho");
    expect(result).toBe("hecho");
    expect(rows).toHaveLength(0);
  });

  it("si el sync revienta a mitad, cierra la fila Y relanza el error", async () => {
    const { write, rows } = fakeWriter();
    const boom = new Error("feed a medias");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withSyncFailureClosing("makito-sync", write, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
    expect(rows[0]?.ok).toBe(false);
    expect(rows[0]?.errorsJson[0]?.message).toBe("feed a medias");
  });

  it("relanza el error original aunque la BD no acepte el cierre", async () => {
    const { write } = fakeWriter(async () => {
      throw new Error("db caída");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("feed a medias");
    await expect(
      withSyncFailureClosing("makito-sync", write, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});

/**
 * El incidente que fija esta tanda (28-ago-2026): `makito` escribió 3.200 de
 * sus 4.479 productos y se quedó esperando algo que nunca llegó. No lanzó, así
 * que no había `catch` que cerrase la fila: más de dos horas «en marcha» para
 * el watchdog, con el proceso dormido y Postgres sin una sola consulta en cola.
 */
describe("withSyncFailureClosing: tope de tiempo para un sync colgado", () => {
  it("el tope por defecto es finito y holgado: entre 15 min y 2 h", () => {
    expect(SYNC_TIMEOUT_MS).toBeGreaterThanOrEqual(15 * 60_000);
    expect(SYNC_TIMEOUT_MS).toBeLessThanOrEqual(120 * 60_000);
  });

  it("un sync que nunca termina acaba CERRANDO la fila, no colgado", async () => {
    vi.useFakeTimers();
    try {
      const { write, rows } = fakeWriter();
      vi.spyOn(console, "error").mockImplementation(() => {});

      // Exactamente el caso real: una promesa que ni resuelve ni rechaza.
      const pendiente = withSyncFailureClosing(
        "makito-sync",
        write,
        () => new Promise<string>(() => {}),
        1000,
      );
      const capturado = pendiente.catch((e) => e);

      await vi.advanceTimersByTimeAsync(1001);
      const error = await capturado;

      expect(error).toBeInstanceOf(SyncTimeoutError);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.finishedAt).toBeInstanceOf(Date);
      expect(rows[0]?.ok).toBe(false);
      expect(rows[0]?.errorsJson[0]?.message).toContain("makito-sync");
    } finally {
      vi.useRealTimers();
    }
  });

  it("no corta un sync que termina dentro del tope", async () => {
    const { write, rows } = fakeWriter();
    const result = await withSyncFailureClosing(
      "cifra-sync",
      write,
      async () => "catálogo al día",
      60_000,
    );
    expect(result).toBe("catálogo al día");
    expect(rows).toHaveLength(0);
  });

  it("no deja el temporizador vivo tras un sync que va bien", async () => {
    vi.useFakeTimers();
    try {
      const { write } = fakeWriter();
      await withSyncFailureClosing("midocean-sync", write, async () => "hecho", 60_000);
      // Si el timer sobreviviera, cada sync dejaría un temporizador de 45 min
      // colgando del proceso.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el mensaje dice de quién es el cuelgue y cuánto se esperó", () => {
    const e = new SyncTimeoutError("makito-sync", 45 * 60_000);
    expect(e.message).toContain("makito-sync");
    expect(e.message).toContain("45 min");
    expect(e.timeoutMs).toBe(45 * 60_000);
  });
});
