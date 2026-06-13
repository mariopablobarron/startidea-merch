"use client";

import { useEffect } from "react";
import { ATTRIB_COOKIE } from "@/lib/attribution";

/**
 * Captura de atribución de PRIMER TOQUE.
 *
 * Al montar, si todavía no hay cookie y la visita trae señal de campaña
 * (utm_*, gclid, fbclid, li_fat_id) o un referrer EXTERNO, guarda el origen
 * en la cookie `merch_attrib` (90 días). No sobreescribe (first-touch), así
 * que el canal que trajo al usuario por primera vez es el que se atribuye.
 *
 * No usa cookies hasta que hay algo que atribuir → no crea cookie en
 * navegación interna directa, coherente con el banner de consentimiento
 * (es una cookie de origen propio, no de terceros).
 */
const MAX_AGE = 60 * 60 * 24 * 90; // 90 días

export function AttributionTracker() {
  useEffect(() => {
    try {
      // First-touch: si ya existe, no tocar.
      if (document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIB_COOKIE}=`))) return;

      const p = new URLSearchParams(window.location.search);
      const utm = {
        source: p.get("utm_source"),
        medium: p.get("utm_medium"),
        campaign: p.get("utm_campaign"),
        term: p.get("utm_term"),
        content: p.get("utm_content"),
      };
      const gclid = p.get("gclid");
      const fbclid = p.get("fbclid");
      const li_fat_id = p.get("li_fat_id");
      const hasUtm = Boolean(utm.source || utm.medium || utm.campaign);

      let refHost = "";
      const ref = document.referrer || "";
      if (ref) {
        try {
          refHost = new URL(ref).host;
        } catch {
          /* referrer no parseable */
        }
      }
      const externalRef = Boolean(refHost && refHost !== window.location.host);

      // Sin señal de campaña ni referrer externo → no hay nada que atribuir.
      if (!hasUtm && !gclid && !fbclid && !li_fat_id && !externalRef) return;

      const data = {
        source:
          utm.source ||
          (gclid ? "google" : fbclid ? "facebook" : externalRef ? refHost : "direct"),
        medium:
          utm.medium ||
          (gclid ? "cpc" : fbclid ? "paid-social" : li_fat_id ? "paid-social" : externalRef ? "referral" : "none"),
        campaign: utm.campaign,
        term: utm.term,
        content: utm.content,
        gclid,
        fbclid,
        li_fat_id,
        referrer: ref || null,
        landing: window.location.pathname,
      };
      // Quitamos null/undefined para una cookie más pequeña.
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v));
      const value = encodeURIComponent(JSON.stringify(clean));
      document.cookie = `${ATTRIB_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
    } catch {
      /* noop — la atribución nunca debe romper la página */
    }
  }, []);

  return null;
}
