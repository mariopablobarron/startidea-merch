import { describe, it, expect, vi } from "vitest";
import {
  closeFailedSync,
  syncFailureMessage,
  withSyncFailureClosing,
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
