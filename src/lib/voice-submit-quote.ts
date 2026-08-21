import { z } from "zod";

/**
 * Schema de entrada de POST /api/voice-agent/tools/submit-quote, fuera del
 * route handler para poder testearlo (un route.ts solo admite los exports que
 * Next reconoce).
 *
 * `product_slug` era el único campo del payload sin tope: se persiste en el
 * CartQuoteItem y entra en un `WHERE slug IN (…)` con hasta 20 elementos.
 * El slug más largo del catálogo mide 80 caracteres (9.626 productos, media 12).
 */
export const MAX_SLUG_CHARS = 160;

/** 20/10 min por IP, el mismo cupo que request-callback: cada llamada crea un
 *  CartQuote real, manda email al cliente y avisa al Telegram del equipo. */
export const SUBMIT_QUOTE_RATE_LIMIT = { key: "voice-submit-quote", max: 20, windowMs: 10 * 60_000 };

export const MarkingSchema = z.object({
  position_id: z.string().max(40),
  technique_code: z.string().max(20),
  number_of_colors: z.number().int().min(1).max(20).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const ItemSchema = z.object({
  product_slug: z.string().min(1).max(MAX_SLUG_CHARS),
  quantity: z.number().int().positive().max(1_000_000),
  // Shape plano (1 marca, compat)
  marking_position_id: z.string().max(40).optional().nullable(),
  technique_code: z.string().max(20).optional().nullable(),
  number_of_colors: z.number().int().min(1).max(10).optional().nullable(),
  // Multi-marca (N marcas en un mismo item: pecho + manga + espalda)
  markings: z.array(MarkingSchema).max(10).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const SubmitQuoteSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  company: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(20),
  voice_session_id: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type SubmitQuoteRequest = z.infer<typeof SubmitQuoteSchema>;
