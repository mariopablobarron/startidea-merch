/**
 * Tests para POST /api/cron/cron-watchdog.
 *
 * Cubre detección de silenciosos, fallos y la lógica anti-spam.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const findMany = vi.fn();
const notifyAdmins = vi.fn();
const requireCronSecret = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

vi.mock("@/lib/notify-admin", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

// El módulo cron-tracking tiene su propio mock de prisma — uso vi.mock
// del módulo entero para controlar lo que devuelve.
vi.mock("@/lib/cron-tracking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-tracking")>(
    "@/lib/cron-tracking",
  );
  return {
    ...actual,
    listCronNames: vi.fn(),
    getCronHistory: vi.fn(),
    wrapCronHandler: (_name: string, h: (r: Request) => Promise<Response>) => h,
  };
});

import { listCronNames, getCronHistory } from "@/lib/cron-tracking";
import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/cron/cron-watchdog", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

const NOW = new Date("2026-06-03T12:00:00Z").getTime();

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  findMany.mockReset();
  notifyAdmins.mockReset();
  requireCronSecret.mockReset();
  requireCronSecret.mockReturnValue({ ok: true });
  vi.mocked(listCronNames).mockReset();
  vi.mocked(getCronHistory).mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("POST /api/cron/cron-watchdog", () => {
  it("401 si cron-secret inválido", async () => {
    requireCronSecret.mockReturnValueOnce({ ok: false, status: 401, reason: "Bad" });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("sin crons trackeados → no alerta", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(0);
    expect(data.issuesCount).toBe(0);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("excluye self del check (cron-watchdog)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([
      "cron-watchdog",
      "ai-usage-alert",
    ]);
    vi.mocked(getCronHistory).mockImplementation(async () => [
      {
        at: new Date(NOW - 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(1); // solo ai-usage-alert
    expect(data.statuses).toHaveLength(1);
    expect(data.statuses[0].name).toBe("ai-usage-alert");
  });

  it("silencioso si lleva > expectedHours sin ejecutar", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    // 48h sin run, umbral 30h
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toContain("ai-usage-alert");
    expect(data.notified).toBe(true);
    expect(notifyAdmins).toHaveBeenCalledOnce();
    const call = notifyAdmins.mock.calls[0][0];
    expect(call.title).toMatch(/cron.*problema/i);
    expect(call.url).toBe("/admin/insights/crons");
  });

  it("failing si última run no fue OK aunque sea reciente", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 60_000).toISOString(), // 1 min hace
        elapsedMs: 50,
        ok: false,
        status: 500,
        error: "boom",
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.failing).toContain("ai-usage-alert");
    expect(data.silent).toEqual([]);
    expect(data.notified).toBe(true);
  });

  it("anti-spam: misma lista que ayer → no alerta de nuevo", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    // BD ya recordaba este como problema
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] });
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.issuesCount).toBe(1);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("anti-spam: lista distinta → sí alerta", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([
      "ai-usage-alert",
      "metric-snapshot",
    ]);
    vi.mocked(getCronHistory).mockImplementation(async (name) => [
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] }); // ayer solo uno
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.notified).toBe(true);
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });

  it("cron sin historial no se considera silencioso (es nuevo)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["new-cron"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toEqual([]);
    expect(data.issuesCount).toBe(0);
    expect(data.notified).toBe(false);
  });

  it("limpia memoria si todo está OK ahora pero antes había issues", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 60_000).toISOString(), // reciente
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] }); // antes había problema
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.notified).toBe(false);
    expect(upsert).toHaveBeenCalledOnce(); // limpia
    const stored = upsert.mock.calls[0][0].update.value;
    expect(stored).toEqual([]);
  });

  it("metric-snapshot tiene umbral 2h (más estricto)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["metric-snapshot"]);
    // 3h sin run, umbral 2h → silencioso
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 3 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toContain("metric-snapshot");
  });
});
