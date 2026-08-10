import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { requireVoiceAgentToolSecret } from "./voice-agent-auth";

/**
 * Tests de src/lib/voice-agent-auth.ts — el guardián de
 * /api/voice-agent/tools/*, que estaba a 0 tests.
 *
 * Importa porque esas tools las llama ElevenLabs desde SUS servidores: sin
 * este corte, cualquiera podría invocar `submit-quote` directamente (spam de
 * solicitudes de presupuesto entrando como leads reales).
 *
 * Aquí el secreto SÍ se lee en cada llamada (no está cacheado en module-load,
 * al revés que en customer-auth), así que basta con tocar process.env.
 */

const SECRET = "secreto-de-las-tools";
const original = process.env.VOICE_AGENT_TOOL_SECRET;

function reqCon(secreto?: string): Request {
  return new Request("https://x.test/api/voice-agent/tools/submit-quote", {
    method: "POST",
    headers: secreto === undefined ? {} : { "x-voice-agent-secret": secreto },
  });
}

beforeEach(() => {
  process.env.VOICE_AGENT_TOOL_SECRET = SECRET;
});

afterAll(() => {
  if (original === undefined) delete process.env.VOICE_AGENT_TOOL_SECRET;
  else process.env.VOICE_AGENT_TOOL_SECRET = original;
});

describe("requireVoiceAgentToolSecret", () => {
  it("acepta el secreto correcto", () => {
    expect(requireVoiceAgentToolSecret(reqCon(SECRET))).toEqual({ ok: true });
  });

  it("lee la cabecera sin importar las mayúsculas", () => {
    const req = new Request("https://x.test/", {
      headers: { "X-Voice-Agent-Secret": SECRET },
    });
    expect(requireVoiceAgentToolSecret(req).ok).toBe(true);
  });

  it("401 si no viene la cabecera", () => {
    expect(requireVoiceAgentToolSecret(reqCon())).toEqual({
      ok: false,
      status: 401,
      reason: "missing secret",
    });
  });

  it("401 si la cabecera viene vacía", () => {
    const r = requireVoiceAgentToolSecret(reqCon(""));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 401 });
  });

  it("403 si el secreto es incorrecto pero de la MISMA longitud", () => {
    // El caso que de verdad ejercita el timingSafeEqual: con longitudes
    // distintas se corta antes y nunca se llega a comparar.
    const mismaLongitud = "X".repeat(SECRET.length);
    expect(mismaLongitud.length).toBe(SECRET.length);
    expect(requireVoiceAgentToolSecret(reqCon(mismaLongitud))).toEqual({
      ok: false,
      status: 403,
      reason: "bad secret",
    });
  });

  it("403 si el secreto es un PREFIJO del correcto (no vale acertar a trozos)", () => {
    expect(requireVoiceAgentToolSecret(reqCon(SECRET.slice(0, -1))).ok).toBe(false);
  });

  it("403 si el secreto lleva basura añadida al final", () => {
    expect(requireVoiceAgentToolSecret(reqCon(SECRET + "x")).ok).toBe(false);
  });

  it("🔒 503 —y NO ok— si el secreto no está configurado en el entorno", () => {
    // Fail-closed: quedarse sin env no puede abrir la puerta. Es el mismo
    // criterio que `requireCronSecret` en auth.ts.
    delete process.env.VOICE_AGENT_TOOL_SECRET;
    expect(requireVoiceAgentToolSecret(reqCon("lo-que-sea"))).toEqual({
      ok: false,
      status: 503,
      reason: "VOICE_AGENT_TOOL_SECRET no configurado",
    });
  });

  it("🔒 503 también si el env está definido pero VACÍO", () => {
    // Un `VOICE_AGENT_TOOL_SECRET=` suelto en un .env es justo cómo se cuela
    // un despliegue inseguro sin que nadie lo note.
    process.env.VOICE_AGENT_TOOL_SECRET = "";
    const r = requireVoiceAgentToolSecret(reqCon(""));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 503 });
  });
});
