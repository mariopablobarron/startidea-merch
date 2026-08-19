import { describe, it, expect } from "vitest";
import {
  VoiceSessionEndSchema,
  MAX_ARGS_BYTES,
  MAX_ARGS_KEYS,
} from "./voice-session-end-schema";

/** Cuerpo mínimo válido: lo que manda de verdad `VoiceAgentWidget`. */
function cuerpoReal(extra: Record<string, unknown> = {}) {
  return {
    voice_session_id: "cmf0a1b2c3d4e5f6g7h8i9j0k",
    duration_sec: 42,
    tools_called: [{ tool: "cotizar_producto", ok: true, at: "2026-08-19T04:05:06.789Z" }],
    product_slugs_discussed: ["taza-ceramica-350ml"],
    ...extra,
  };
}

describe("VoiceSessionEndSchema", () => {
  // Los topes se fijan con literales A PROPÓSITO. Los tests de abajo derivan
  // sus tamaños de las constantes, así que se mueven con ellas: sin este test,
  // subir MAX_ARGS_BYTES a 100 MB dejaría toda la suite en verde (comprobado
  // mutándolo — no cazaba). Cambiar un tope obliga a tocar esta línea y a
  // justificarlo contra la medición de producción del módulo.
  it("fija los topes en su valor medido, no en el que diga la constante", () => {
    expect(MAX_ARGS_BYTES).toBe(2048);
    expect(MAX_ARGS_KEYS).toBe(20);
  });

  it("rechaza un args absurdo (100 KB) sea cual sea la constante", () => {
    const enorme = { v: "x".repeat(100_000) };
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t", ok: true, args: enorme }] }),
      ).success,
    ).toBe(false);
  });
  it("acepta el cuerpo que manda el widget real", () => {
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal()).success).toBe(true);
  });

  it("acepta un args dentro del tope y rechaza el que lo pasa", () => {
    const dentro = { v: "x".repeat(MAX_ARGS_BYTES - 20) };
    const fuera = { v: "x".repeat(MAX_ARGS_BYTES + 100) };
    expect(JSON.stringify(dentro).length).toBeLessThanOrEqual(MAX_ARGS_BYTES);
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t", ok: true, args: dentro }] }),
      ).success,
    ).toBe(true);
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t", ok: true, args: fuera }] }),
      ).success,
    ).toBe(false);
  });

  it("rechaza un args con demasiadas claves aunque sea pequeño", () => {
    const muchas = Object.fromEntries(
      Array.from({ length: MAX_ARGS_KEYS + 1 }, (_, i) => [`k${i}`, 1]),
    );
    expect(JSON.stringify(muchas).length).toBeLessThan(MAX_ARGS_BYTES);
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t", ok: true, args: muchas }] }),
      ).success,
    ).toBe(false);
  });

  it("acota el nombre de la herramienta (100)", () => {
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t".repeat(100), ok: true }] }),
      ).success,
    ).toBe(true);
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t".repeat(101), ok: true }] }),
      ).success,
    ).toBe(false);
  });

  it("acota el `at` de cada herramienta (40) sin recortar un ISO 8601", () => {
    const iso = new Date().toISOString();
    expect(iso.length).toBeLessThanOrEqual(40);
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ tools_called: [{ tool: "t", ok: true, at: iso }] }))
        .success,
    ).toBe(true);
    expect(
      VoiceSessionEndSchema.safeParse(
        cuerpoReal({ tools_called: [{ tool: "t", ok: true, at: "z".repeat(41) }] }),
      ).success,
    ).toBe(false);
  });

  it("acota el voice_session_id (100) dejando margen sobre el cuid real de 25", () => {
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ voice_session_id: "a".repeat(100) })).success).toBe(
      true,
    );
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ voice_session_id: "a".repeat(101) })).success).toBe(
      false,
    );
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ voice_session_id: "" })).success).toBe(false);
  });

  it("acota el id de conversación de ElevenLabs (100)", () => {
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ elevenlabs_conversation_id: "c".repeat(100) })).success,
    ).toBe(true);
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ elevenlabs_conversation_id: "c".repeat(101) })).success,
    ).toBe(false);
    // El emisor real manda null cuando aún no hay conversación.
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ elevenlabs_conversation_id: null })).success).toBe(
      true,
    );
  });

  it("acota cada slug (160) con margen sobre el más largo real (80)", () => {
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ product_slugs_discussed: ["s".repeat(160)] })).success,
    ).toBe(true);
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ product_slugs_discussed: ["s".repeat(161)] })).success,
    ).toBe(false);
  });

  it("mantiene los topes que ya existían: 50 herramientas, 50 slugs, 400 mensajes", () => {
    const tool = { tool: "t", ok: true };
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ tools_called: Array(51).fill(tool) })).success,
    ).toBe(false);
    expect(
      VoiceSessionEndSchema.safeParse(cuerpoReal({ product_slugs_discussed: Array(51).fill("s") })).success,
    ).toBe(false);
    const msg = { role: "user" as const, text: "hola" };
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ transcript: Array(400).fill(msg) })).success).toBe(
      true,
    );
    expect(VoiceSessionEndSchema.safeParse(cuerpoReal({ transcript: Array(401).fill(msg) })).success).toBe(
      false,
    );
  });
});
