/**
 * Validación del cuerpo de POST /api/newsletter/subscribe.
 *
 * Vive fuera de `route.ts` porque Next sólo admite en un route handler los
 * exports que reconoce (métodos HTTP y config), y este schema necesita ser
 * importable para poder probarlo. Mismo patrón que
 * `proposal-send-schema.ts` y `voice-session-end-schema.ts`.
 *
 * La ruta es PÚBLICA y sin auth: escribe en `NewsletterSubscriber` y dispara
 * un email real de Resend **a la dirección que le manden**. El tope de 160
 * caracteres es el que ya usan `partners/apply` y `calculadora-rsc`; sobre los
 * 2.711 suscriptores reales de producción, el email más largo mide 51.
 */
import { z } from "zod";

/** Tope de email, en caracteres. Ver arriba: máximo real medido = 51. */
export const MAX_EMAIL_CHARS = 160;

export const NewsletterSubscribeSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_CHARS),
  name: z.string().max(120).optional(),
  company: z.string().max(160).optional(),
  source: z.string().max(60).optional(),
});

export type NewsletterSubscribe = z.infer<typeof NewsletterSubscribeSchema>;
