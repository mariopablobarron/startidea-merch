/**
 * Atribución de marketing — de primer toque (first-touch).
 *
 * El cliente (AttributionTracker) guarda en una cookie `merch_attrib` los
 * parámetros UTM + click-ids + referrer de la PRIMERA visita con señal de
 * campaña. El servidor lee esa cookie al crear un CartQuote y la persiste en
 * `CartQuote.utm`, de modo que el panel de atribución
 * (/admin/analytics/attribution) pueda decir de qué canal vino cada venta.
 *
 * Cookie sin ":" en el nombre a propósito (evita el lío de encoding del
 * `merch:ref` de referral). 90 días de vida.
 */

export type Attribution = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  li_fat_id?: string | null;
  referrer?: string | null;
  landing?: string | null;
};

export const ATTRIB_COOKIE = "merch_attrib";

/**
 * Lee la cookie de atribución desde un Request (Route Handler / Server Comp).
 * Devuelve null si no hay cookie o no parsea.
 */
export function readAttribution(req: Request): Attribution | null {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ATTRIB_COOKIE}=([^;]+)`));
  if (!m) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(m[1])) as unknown;
    if (obj && typeof obj === "object") {
      // Saneamos: solo campos conocidos, strings, recortados.
      const src = obj as Record<string, unknown>;
      const pick = (k: string): string | null => {
        const v = src[k];
        return typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null;
      };
      return {
        source: pick("source"),
        medium: pick("medium"),
        campaign: pick("campaign"),
        term: pick("term"),
        content: pick("content"),
        gclid: pick("gclid"),
        fbclid: pick("fbclid"),
        li_fat_id: pick("li_fat_id"),
        referrer: pick("referrer"),
        landing: pick("landing"),
      };
    }
  } catch {
    /* cookie corrupta — ignorar */
  }
  return null;
}
