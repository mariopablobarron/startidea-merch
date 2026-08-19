/**
 * Validación del cuerpo de POST /api/voice-agent/session-end.
 *
 * Vive fuera de `route.ts` porque Next sólo admite en un route handler los
 * exports que reconoce (métodos HTTP y config), y este schema necesita ser
 * importable para poder probarlo.
 *
 * La ruta es PÚBLICA (sin sesión de admin): quien llama controla el cuerpo
 * entero y lo que mande se persiste tal cual en columnas JSON de
 * `VoiceSession`. Está mitigada —exige un `voice_session_id` existente y aún
 * abierto, es de un solo uso y tiene rate limit— pero varios campos no tenían
 * `.max()` ninguno.
 *
 * TODOS los topes salen de medir producción, no de suponer:
 *   · `id` de VoiceSession: 25 caracteres (cuid), sobre 88 sesiones reales.
 *   · `slug` de producto: 80 caracteres el más largo, sobre 9.626 productos.
 *   · `at`: ISO 8601 son 24 caracteres.
 *   · `tools_called[].args`: **0 filas lo usan** — el único emisor real
 *     (`VoiceAgentWidget`) manda `{tool, ok, at}` y su propio tipo no incluye
 *     `args`. Se acota en vez de retirarlo para no cerrar el contrato, pero
 *     hoy ningún evento legítimo lo llena.
 */
import { z } from "zod";

/** Tope del `args` serializado, en bytes. Ver arriba: hoy nadie lo manda. */
export const MAX_ARGS_BYTES = 2048;
export const MAX_ARGS_KEYS = 20;

const ArgsSchema = z.unknown().superRefine((args, ctx) => {
  if (args === undefined || args === null) return;
  if (typeof args === "object" && Object.keys(args as object).length > MAX_ARGS_KEYS) {
    ctx.addIssue({ code: "custom", message: `args con demasiadas claves (máx. ${MAX_ARGS_KEYS})` });
    return;
  }
  // El cuerpo viene de JSON.parse, así que no puede tener ciclos; aun así un
  // stringify fallido se trata como "no acotable" y se rechaza, que es el lado
  // seguro.
  let size: number;
  try {
    size = JSON.stringify(args)?.length ?? 0;
  } catch {
    ctx.addIssue({ code: "custom", message: "args no serializable" });
    return;
  }
  if (size > MAX_ARGS_BYTES) {
    ctx.addIssue({ code: "custom", message: `args demasiado grande (máx. ${MAX_ARGS_BYTES} bytes)` });
  }
});

const TranscriptMsg = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string().max(4000),
});

export const VoiceSessionEndSchema = z.object({
  voice_session_id: z.string().min(1).max(100),
  elevenlabs_conversation_id: z.string().max(100).optional().nullable(),
  duration_sec: z.number().int().min(0).max(3600),
  tools_called: z
    .array(
      z.object({
        tool: z.string().max(100),
        args: ArgsSchema.optional(),
        ok: z.boolean(),
        at: z.string().max(40).optional(),
      }),
    )
    .max(50)
    .optional(),
  product_slugs_discussed: z.array(z.string().max(160)).max(50).optional(),
  // Transcripción vista por el widget — fallback si la API de ElevenLabs
  // aún no tiene la conversación disponible.
  transcript: z.array(TranscriptMsg).max(400).optional(),
});

/** Cuerpo ya validado — lo consume el aviso de Telegram de la ruta. */
export type VoiceSessionEnd = z.infer<typeof VoiceSessionEndSchema>;
