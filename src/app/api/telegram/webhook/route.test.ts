import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({
  after: vi.fn(), runAgent: vi.fn(), send: vi.fn(), claim: vi.fn(), finish: vi.fn(),
}));
vi.mock("next/server", () => ({
  after: effects.after,
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/lib/telegram-admin-agent", () => ({ runTelegramAdminAgent: effects.runAgent }));
vi.mock("@/lib/telegram", () => ({ sendTelegramTo: effects.send }));
vi.mock("@/lib/telegram-update-receipt", () => ({
  claimTelegramUpdate: effects.claim, finishTelegramUpdate: effects.finish,
}));

import { POST } from "./route";
import { TELEGRAM_ADMIN_HELP, TELEGRAM_ADMIN_MENU } from "@/lib/telegram-admin-menu";

const now = new Date("2026-09-05T12:00:00.000Z");
const timestamp = now.getTime() / 1000;
const actor = { actorId: "123", chatId: "123", messageId: 88 };
const ownershipToken = "owner-of-update-4321";

function update() {
  return { update_id: 4321, message: {
    message_id: 88, date: timestamp, text: "Busca botellas", chat: { id: 123, type: "private" },
    from: { id: 123, is_bot: false },
  } };
}
function request(body: unknown = update(), secret: string | null = "test-webhook-secret") {
  return new Request("https://local.example.invalid/api/telegram/webhook", {
    method: "POST", headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function expectNoWork() {
  expect(effects.claim).not.toHaveBeenCalled();
  expect(effects.after).not.toHaveBeenCalled();
  expect(effects.runAgent).not.toHaveBeenCalled();
  expect(effects.send).not.toHaveBeenCalled();
  expect(effects.finish).not.toHaveBeenCalled();
}
async function runAfter() {
  expect(effects.after).toHaveBeenCalledTimes(1);
  await (effects.after.mock.calls[0][0] as () => Promise<void>)();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-webhook-secret");
  vi.stubEnv("TELEGRAM_ADMIN_CHAT_IDS", "123, 456");
  vi.stubEnv("TELEGRAM_TEAM_CHAT_ID", "");
  vi.stubEnv("TELEGRAM_CHAT_ID", "");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Red prohibida en pruebas")));
  vi.spyOn(console, "error").mockImplementation(() => {});
  effects.claim.mockResolvedValue(ownershipToken);
  effects.finish.mockResolvedValue(undefined);
  effects.send.mockResolvedValue(true);
  effects.runAgent.mockResolvedValue("Hay cinco botellas disponibles.");
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("webhook Telegram · autenticación y forma de la entrega", () => {
  it("sin secreto configurado devuelve 503 y no procesa nada", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    expectNoWork();
  });
  it.each([null, "incorrecto"])("secreto %s devuelve 401 antes de leer trabajo", async (secret) => {
    expect((await POST(request(update(), secret))).status).toBe(401);
    expectNoWork();
  });
  it.each([null, [], {}, { update_id: -1 }, { update_id: 1.5 }, { update_id: Number.MAX_SAFE_INTEGER + 1 },
    { update_id: 4321, message: null }, { update_id: 4321, message: [] }, "{", "x".repeat(16_385)])(
    "descarta payload inválido sin LLM/recibo (%j)", async (body) => {
      expect((await POST(request(body))).status).toBe(200);
      expectNoWork();
    },
  );
  it.each(["", "   ", "x".repeat(4097)])("descarta texto vacío o sobredimensionado (%s)", async (text) => {
    const body = update(); body.message.text = text;
    expect((await POST(request(body))).status).toBe(200);
    expectNoWork();
  });
  it("un update sin mensaje no inicia una consulta", async () => {
    expect((await POST(request({ update_id: 4321 }))).status).toBe(200);
    expectNoWork();
  });
});

describe("webhook Telegram · identidad personal y vigencia", () => {
  it.each([
    ["grupo", { chat: { id: 123, type: "group" }, from: { id: 123, is_bot: false } }],
    ["supergrupo", { chat: { id: 123, type: "supergroup" }, from: { id: 123, is_bot: false } }],
    ["canal", { chat: { id: 123, type: "channel" }, from: { id: 123, is_bot: false } }],
    ["bot", { chat: { id: 123, type: "private" }, from: { id: 123, is_bot: true } }],
    ["remitente ausente", { chat: { id: 123, type: "private" }, from: undefined }],
    ["remitente distinto", { chat: { id: 123, type: "private" }, from: { id: 456, is_bot: false } }],
    ["fuera de allowlist", { chat: { id: 999, type: "private" }, from: { id: 999, is_bot: false } }],
  ])("rechaza %s aunque el secreto de Telegram sea válido", async (_label, identity) => {
    const body = update();
    const response = await POST(request({ ...body, message: { ...body.message, ...identity } }));
    expect(response.status).toBe(200);
    expectNoWork();
  });

  it.each([24 * 3600 + 1, -301])("rechaza fecha fuera de ventana (%s segundos)", async (age) => {
    const body = update(); body.message.date = timestamp - age;
    expect((await POST(request(body))).status).toBe(200);
    expectNoWork();
  });

  it.each([0, 24 * 3600, -300])("admite remitente personal exacto y edad permitida (%s segundos)", async (age) => {
    const body = update(); body.message.date = timestamp - age;
    expect((await POST(request(body))).status).toBe(200);
    expect(effects.claim).toHaveBeenCalledWith(4321, actor);
    expect(effects.after).toHaveBeenCalledTimes(1);
    expect(effects.runAgent).not.toHaveBeenCalled();
    expect(effects.send).not.toHaveBeenCalled();
  });

  it("sin allowlist efectiva no abre ningún turno", async () => {
    vi.stubEnv("TELEGRAM_ADMIN_CHAT_IDS", "");
    expect((await POST(request())).status).toBe(200);
    expectNoWork();
  });
});

describe("webhook Telegram · deduplicación y trabajo tras el ACK", () => {
  it("una entrega repetida no registra after ni consulta el modelo", async () => {
    effects.claim.mockResolvedValue(null);
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(effects.after).not.toHaveBeenCalled();
    expect(effects.runAgent).not.toHaveBeenCalled();
    expect(effects.send).not.toHaveBeenCalled();
    expect(effects.finish).not.toHaveBeenCalled();
  });

  it("si la BD no admite el recibo devuelve 503 para reintento y no procesa", async () => {
    effects.claim.mockRejectedValue(new Error("DB unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(effects.after).not.toHaveBeenCalled();
    expect(effects.runAgent).not.toHaveBeenCalled();
    expect(effects.send).not.toHaveBeenCalled();
    expect(effects.finish).not.toHaveBeenCalled();
  });

  it.each(["/menu", "/start", "/help", "/ayuda", "/hoy", "hoy", "abrir panel"])(
    "%s entrega el menú real sin consumir LLM y termina el recibo", async (text) => {
      const body = update(); body.message.text = text;
      const response = await POST(request(body));
      expect(response.status).toBe(200);
      expect(effects.send).not.toHaveBeenCalled();
      await runAfter();
      expect(effects.runAgent).not.toHaveBeenCalled();
      expect(effects.send).toHaveBeenCalledExactlyOnceWith("123", TELEGRAM_ADMIN_HELP, { replyMarkup: TELEGRAM_ADMIN_MENU });
      expect(effects.finish).toHaveBeenCalledExactlyOnceWith(4321, actor, "answered", ownershipToken);
    },
  );

  it("la consulta se ejecuta después del ACK, entrega su respuesta y queda answered", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(effects.runAgent).not.toHaveBeenCalled();
    await runAfter();
    expect(effects.runAgent).toHaveBeenCalledExactlyOnceWith("123", "Busca botellas");
    expect(effects.send).toHaveBeenCalledExactlyOnceWith("123", "Hay cinco botellas disponibles.");
    expect(effects.finish).toHaveBeenCalledExactlyOnceWith(4321, actor, "answered", ownershipToken);
  });

  it("una parte no entregada conserva undelivered aunque las siguientes se envíen", async () => {
    const reply = "a".repeat(4000) + "b".repeat(4000) + "c";
    effects.runAgent.mockResolvedValue(reply);
    effects.send.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await POST(request());
    await runAfter();
    expect(effects.send.mock.calls.map((call) => call[1]).join("")).toBe(reply);
    expect(effects.send.mock.calls.map((call) => call[1].length)).toEqual([4000, 4000, 1]);
    expect(effects.finish).toHaveBeenCalledExactlyOnceWith(4321, actor, "undelivered", ownershipToken);
  });

  it("el menú no entregado también queda undelivered", async () => {
    const body = update(); body.message.text = "/menu";
    effects.send.mockResolvedValue(false);
    await POST(request(body));
    await runAfter();
    expect(effects.runAgent).not.toHaveBeenCalled();
    expect(effects.finish).toHaveBeenCalledExactlyOnceWith(4321, actor, "undelivered", ownershipToken);
  });

  it.each([true, false])("si falla el agente el aviso de error enviado=%s determina el estado", async (sent) => {
    effects.runAgent.mockRejectedValue(new Error("LLM unavailable"));
    effects.send.mockResolvedValue(sent);
    await POST(request());
    await runAfter();
    expect(effects.send).toHaveBeenCalledWith("123", expect.stringMatching(/No se ha realizado ningún cambio/));
    expect(effects.finish).toHaveBeenCalledExactlyOnceWith(4321, actor, sent ? "failed" : "undelivered", ownershipToken);
  });

  it("si falla guardar el resultado no repite LLM ni entrega", async () => {
    effects.finish.mockRejectedValue(new Error("finish unavailable"));
    await POST(request());
    await expect(runAfter()).resolves.toBeUndefined();
    expect(effects.runAgent).toHaveBeenCalledTimes(1);
    expect(effects.send).toHaveBeenCalledTimes(1);
    expect(effects.finish).toHaveBeenCalledTimes(1);
  });
});
