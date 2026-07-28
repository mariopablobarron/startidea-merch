import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const findUnique = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));

import {
  recordCronRun,
  getCronHistory,
  listCronNames,
  wrapCronHandler,
  type CronRun,
} from "./cron-tracking";

beforeEach(() => {
  findUnique.mockReset();
  findMany.mockReset();
  upsert.mockReset();
});

describe("recordCronRun", () => {
  it("añade run al inicio de array vacío", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const run: CronRun = {
      at: "2026-06-03T10:00:00Z",
      elapsedMs: 1500,
      ok: true,
      status: 200,
    };
    await recordCronRun("test-cron", run);
    expect(upsert).toHaveBeenCalledOnce();
    const call = upsert.mock.calls[0][0];
    expect(call.where.key).toBe("cron_runs_test-cron");
    expect(call.create.value).toEqual([run]);
  });

  it("añade run al inicio + cap a 20 entries", async () => {
    const existing: CronRun[] = Array.from({ length: 20 }, (_, i) => ({
      at: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      elapsedMs: 1000,
      ok: true,
      status: 200,
    }));
    findUnique.mockResolvedValueOnce({ value: existing });
    upsert.mockResolvedValueOnce({});
    await recordCronRun("test-cron", {
      at: "2026-07-01T00:00:00Z",
      elapsedMs: 500,
      ok: false,
      status: 500,
      error: "boom",
    });
    const stored = upsert.mock.calls[0][0].update.value as CronRun[];
    expect(stored).toHaveLength(20);
    expect(stored[0].at).toBe("2026-07-01T00:00:00Z");
    expect(stored[19].at).toBe("2026-06-19T00:00:00Z"); // el más antiguo cae
  });

  it("no rompe si BD lanza al persistir", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    // No debe lanzar
    await expect(
      recordCronRun("test-cron", {
        at: "2026-06-03T10:00:00Z",
        elapsedMs: 500,
        ok: true,
        status: 200,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("getCronHistory", () => {
  it("devuelve array si la key existe", async () => {
    const runs: CronRun[] = [
      { at: "x", elapsedMs: 100, ok: true, status: 200 },
    ];
    findUnique.mockResolvedValueOnce({ value: runs });
    expect(await getCronHistory("test-cron")).toEqual(runs);
  });

  it("[] si no existe", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await getCronHistory("test-cron")).toEqual([]);
  });

  it("[] si value corrupto (no es array)", async () => {
    findUnique.mockResolvedValueOnce({ value: "not-array" });
    expect(await getCronHistory("test-cron")).toEqual([]);
  });

  it("[] si BD lanza", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await getCronHistory("test-cron")).toEqual([]);
  });
});

describe("listCronNames", () => {
  it("extrae nombre sin prefijo", async () => {
    findMany.mockResolvedValueOnce([
      { key: "cron_runs_auto-resolve-errors" },
      { key: "cron_runs_ai-usage-alert" },
    ]);
    expect(await listCronNames()).toEqual([
      "ai-usage-alert",
      "auto-resolve-errors",
    ]);
  });

  it("[] si BD lanza", async () => {
    findMany.mockRejectedValueOnce(new Error("db down"));
    expect(await listCronNames()).toEqual([]);
  });
});

describe("wrapCronHandler", () => {
  it("ejecuta handler y persiste run ok=true si retorna 200", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = wrapCronHandler("test-cron", handler);
    const res = await wrapped(new Request("https://t"));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    // Esperar a que la persistencia (fire-and-forget en finally) complete
    await new Promise((r) => setTimeout(r, 10));
    expect(upsert).toHaveBeenCalledOnce();
    const stored = (upsert.mock.calls[0][0].create.value as CronRun[])[0];
    expect(stored.ok).toBe(true);
    expect(stored.status).toBe(200);
    expect(stored.error).toBeUndefined();
  });

  it("persiste run ok=false si handler lanza, re-lanza error", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const handler = vi.fn().mockRejectedValue(new Error("boom interno"));
    const wrapped = wrapCronHandler("test-cron", handler);
    await expect(wrapped(new Request("https://t"))).rejects.toThrow("boom interno");
    await new Promise((r) => setTimeout(r, 10));
    expect(upsert).toHaveBeenCalledOnce();
    const stored = (upsert.mock.calls[0][0].create.value as CronRun[])[0];
    expect(stored.ok).toBe(false);
    expect(stored.status).toBe(500);
    expect(stored.error).toBe("boom interno");
  });

  it("persiste run ok=false si handler retorna 500", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ error: "boom" }, { status: 500 }),
    );
    const wrapped = wrapCronHandler("test-cron", handler);
    const res = await wrapped(new Request("https://t"));
    expect(res.status).toBe(500);
    await new Promise((r) => setTimeout(r, 10));
    const stored = (upsert.mock.calls[0][0].create.value as CronRun[])[0];
    expect(stored.ok).toBe(false);
    expect(stored.status).toBe(500);
  });

  it("NO registra un 401: una llamada sin secreto no es una ejecución del cron", async () => {
    // Pasó de verdad el 27-jul: unos 401 dejaron tres crons marcados como
    // "última run = fallo". Para un cron semanal o mensual ese rojo dura
    // semanas y tapa los avisos reales del watchdog.
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const wrapped = wrapCronHandler("test-cron", handler);
    const res = await wrapped(new Request("https://t"));
    expect(res.status).toBe(401); // la respuesta al llamante no cambia
    await new Promise((r) => setTimeout(r, 10));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("NO registra un 403 (misma razón que el 401)", async () => {
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 }),
    );
    const wrapped = wrapCronHandler("test-cron", handler);
    await wrapped(new Request("https://t"));
    await new Promise((r) => setTimeout(r, 10));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("un 401 lanzado como excepción SÍ se registra (es un fallo real, no un rechazo)", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const handler = vi.fn().mockRejectedValue(new Error("401 al llamar a un tercero"));
    const wrapped = wrapCronHandler("test-cron", handler);
    await expect(wrapped(new Request("https://t"))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("trunca mensaje de error a 300 chars", async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const longMsg = "x".repeat(500);
    const handler = vi.fn().mockRejectedValue(new Error(longMsg));
    const wrapped = wrapCronHandler("test-cron", handler);
    await expect(wrapped(new Request("https://t"))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    const stored = (upsert.mock.calls[0][0].create.value as CronRun[])[0];
    expect(stored.error?.length).toBe(300);
  });
});
