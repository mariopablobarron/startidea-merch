"use client";

import { useEffect } from "react";

/**
 * Registra el service worker /sw.js. Se monta en el root layout.
 * Soft-fail: si el navegador no lo soporta, no hace nada.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Diferimos el registro para no bloquear LCP
    const id = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[sw] registration failed", err);
        });
    }, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}
