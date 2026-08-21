import { z } from "zod";

/**
 * Schema de entrada de POST /api/recommend, fuera del route handler para poder
 * testearlo (un route.ts solo admite los exports que Next reconoce).
 *
 * Todo campo de texto lleva tope porque TODOS acaban en el prompt que se manda
 * al LLM vía OpenRouter: cada carácter de más es coste real facturado. `brief`,
 * `history` y `followUp` ya lo tenían; `preferredCategories` capaba el número
 * de elementos (8) pero NO la longitud de cada uno, así que 8 strings de
 * tamaño arbitrario entraban enteros al prompt.
 */

/** El nombre de categoría más largo del catálogo mide 46 caracteres (558 categorías, media 17). */
export const MAX_CATEGORY_CHARS = 60;
export const MAX_CATEGORIES = 8;

export const RecommendSchema = z.object({
  brief: z.string().min(20).max(2000),
  budget: z.number().int().positive().max(1_000_000).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  preferredCategories: z
    .array(z.string().max(MAX_CATEGORY_CHARS))
    .max(MAX_CATEGORIES)
    .optional(),
  ecoOnly: z.boolean().optional(),
  // Conversación: turnos previos (brief inicial + resúmenes del asistente) y
  // el nuevo mensaje del cliente. Con followUp presente, el último mensaje al
  // modelo es ese texto (el brief original viaja dentro de history). Capado
  // corto: es contexto, no un segundo brief.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1500),
      }),
    )
    .max(10)
    .optional(),
  followUp: z.string().min(1).max(1000).optional(),
});

export type RecommendRequest = z.infer<typeof RecommendSchema>;
