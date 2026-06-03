/**
 * Tests para POST /api/cron/ai-usage-alert.
 *
 * Cubre la lógica de umbral + anti-spam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const notifyAdmins = vi.fn();
const requireCronSecret = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
    recommenderQuery: {
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

import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/cron/ai-usage-alert", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  findUnique.mockReset();
  findMany.mockReset();
  notifyAdmins.mockReset();
  requireCronSecret.mockReset();
  requireCronSecret.mockReturnValue({ ok: true });
  delete process.env.AI_USAGE_ALERT_THRESHOLD_EUR;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// Helper: 1 query Opus con N tokens output produce coste ≈ N/1M * 75 * 0.93 €
// Para 5€ necesitamos ~71_700 tokens output. Para 10€ → ~143_400.
function opusQuery(promptTokens: number, completionTokens: number) {
  return {
    modelUsed: "anthropic/claude-opus-4.7",
    promptTokens,
    completionTokens,
  };
}

describe("POST /api/cron/ai-usage-alert", () => {
  it("401 si cron-secret inválido", async () => {
    requireCronSecret.mockReturnValueOnce({
      ok: false,
      status: 401,
      reason: "Bad secret",
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("sin queries → notified=false, no alerta", async () => {
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([]);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.yesterdayCost).toBe(0);
    expect(data.exceeded).toBe(false);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("queries pero bajo umbral → no alerta", async () => {
    findUnique.mockResolvedValue(null); // sin AdminSetting → default 5
    // Día anterior: 1 query con coste ≈ 1.4 € (20K tokens output Opus)
    findMany.mockResolvedValueOnce([opusQuery(0, 20_000)]); // yesterday
    findMany.mockResolvedValueOnce([]); // day before
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.exceeded).toBe(false);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("pasa umbral primera vez → alerta enviada", async () => {
    findUnique.mockResolvedValue(null);
    // Día anterior: alto (≥ 5€ → ~72K output Opus)
    findMany.mockResolvedValueOnce([opusQuery(0, 100_000)]); // ~6.97 €
    findMany.mockResolvedValueOnce([]); // day before: bajo
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.exceeded).toBe(true);
    expect(data.wasExceededYesterday).toBe(false);
    expect(data.notified).toBe(true);
    expect(notifyAdmins).toHaveBeenCalledOnce();
    const call = notifyAdmins.mock.calls[0][0];
    expect(call.title).toMatch(/Gasto IA alto/);
    expect(call.url).toBe("/admin/insights#ai-usage");
  });

  it("pasa umbral PERO también ayer → anti-spam, no alerta", async () => {
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValueOnce([opusQuery(0, 100_000)]); // ~6.97 €
    findMany.mockResolvedValueOnce([opusQuery(0, 100_000)]); // day before también alto
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.exceeded).toBe(true);
    expect(data.wasExceededYesterday).toBe(true);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect(data.note).toMatch(/anti-spam/i);
  });

  it("AdminSetting umbral sobreescribe env y default", async () => {
    process.env.AI_USAGE_ALERT_THRESHOLD_EUR = "100"; // env muy alto
    findUnique.mockResolvedValue({ value: 1 }); // AdminSetting muy bajo → debe ganar
    findMany.mockResolvedValueOnce([opusQuery(0, 50_000)]); // ~3.5 €, supera 1 pero no 100
    findMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.thresholdEur).toBe(1);
    expect(data.exceeded).toBe(true);
    expect(data.notified).toBe(true);
  });

  it("env sobreescribe default si no hay AdminSetting", async () => {
    process.env.AI_USAGE_ALERT_THRESHOLD_EUR = "20";
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValueOnce([opusQuery(0, 100_000)]); // ~6.97 € → no pasa 20
    findMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.thresholdEur).toBe(20);
    expect(data.exceeded).toBe(false);
    expect(data.notified).toBe(false);
  });

  it("default 5€ si nada configurado", async () => {
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.thresholdEur).toBe(5);
  });

  it("BD lanza en findUnique → fallback a env/default sin romper", async () => {
    findUnique.mockRejectedValue(new Error("db error"));
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.thresholdEur).toBe(5); // default
  });
});
