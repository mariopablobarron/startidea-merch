/**
 * Validación del cuerpo de POST /api/analytics/event.
 *
 * Vive fuera de `route.ts` porque Next sólo admite en un route handler los
 * exports que reconoce (métodos HTTP y config), y este schema necesita ser
 * importable para poder probarlo.
 */
import { z } from "zod";

/**
 * Tope del `payload` serializado, en bytes. La ruta es PÚBLICA y anónima
 * (fire-and-forget desde el browser con sendBeacon), así que quien llama
 * controla el cuerpo entero y lo que mande se persiste tal cual en la columna
 * JSON de `AnalyticsEvent`. Todos los demás campos ya tenían `.max()`; el
 * `payload` era un `z.record(z.string(), z.unknown())` sin acotar.
 *
 * El tope se eligió DESPUÉS de medir producción, no antes: sobre 39.580
 * eventos reales (16-may → 18-ago, 24 MB de tabla), el payload más grande son
 * **240 bytes**, la media 59, el máximo de claves 3 y el valor más largo 232
 * bytes. 4 KB deja ~17x de margen sobre lo real: no recorta ningún evento
 * legítimo, sólo corta la cola absurda.
 */
export const MAX_PAYLOAD_BYTES = 4096;
export const MAX_PAYLOAD_KEYS = 20;

const PayloadSchema = z
  .record(z.string().max(60), z.unknown())
  .superRefine((payload, ctx) => {
    const keys = Object.keys(payload);
    if (keys.length > MAX_PAYLOAD_KEYS) {
      ctx.addIssue({
        code: "custom",
        message: `payload con demasiadas claves (máx. ${MAX_PAYLOAD_KEYS})`,
      });
      return;
    }
    // El cuerpo viene de JSON.parse, así que no puede tener ciclos; aun así
    // tratamos un stringify fallido como "no acotable" y lo rechazamos, que es
    // el lado seguro.
    let size: number;
    try {
      size = JSON.stringify(payload)?.length ?? 0;
    } catch {
      ctx.addIssue({ code: "custom", message: "payload no serializable" });
      return;
    }
    if (size > MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `payload demasiado grande (máx. ${MAX_PAYLOAD_BYTES} bytes)`,
      });
    }
  });

export const AnalyticsEventSchema = z.object({
  type: z.string().min(1).max(60),
  path: z.string().max(500).optional(),
  productSlug: z.string().max(120).optional(),
  payload: PayloadSchema.optional(),
  sessionId: z.string().max(60).optional(),
});
