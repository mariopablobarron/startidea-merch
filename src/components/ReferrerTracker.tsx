"use client";

import { useEffect } from "react";

/**
 * Captura document.referrer en la primera carga de cada sesión y lo
 * envía a /api/track/referrer. Sólo dispara si el referrer NO es del
 * mismo dominio. Dedup por sessionStorage.
 *
 * Montado en root layout junto a los demás trackers.
 */
export function ReferrerTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!document.referrer) return;

    const key = "ref:logged";
    if (sessionStorage.getItem(key)) return;

    try {
      const refUrl = new URL(document.referrer);
      const myHost = window.location.host;
      if (refUrl.host === myHost) {
        sessionStorage.setItem(key, "1");
        return;
      }
      sessionStorage.setItem(key, "1");
      void fetch("/api/track/referrer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrer: document.referrer,
          landingPath: window.location.pathname.slice(0, 200),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, []);
  return null;
}
