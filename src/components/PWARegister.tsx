"use client";

import { useEffect } from "react";

/**
 * Detecta si el dispositivo es móvil (Android/iOS u otro pequeño con
 * touch). Usado para suprimir el prompt nativo de instalación PWA en
 * desktop — instalar una webapp full-screen en un PC no tiene sentido
 * (el usuario ya tiene la pestaña del navegador con todo el espacio).
 */
function isMobileLike(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Patrones más comunes de UA móvil
  if (/android|iphone|ipad|ipod|opera mini|iemobile|mobile safari|silk/i.test(ua)) {
    return true;
  }
  // Touch screen + viewport pequeño como heurística secundaria
  const hasTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints
    ? (navigator as Navigator & { maxTouchPoints: number }).maxTouchPoints > 0
    : false;
  const smallViewport = window.matchMedia("(max-width: 768px)").matches;
  return hasTouch && smallViewport;
}

/**
 * Registra el service worker /sw.js y suprime el prompt nativo de
 * instalación PWA cuando el visitante usa desktop.
 *
 * En desktop el prompt "Instalar TodoMerchandising" no aporta — la
 * webapp full-screen es una experiencia diseñada para móvil. El SW
 * sigue registrándose para que el modo offline / cache funcione,
 * solo se silencia el banner de instalación.
 *
 * Soft-fail: si el navegador no soporta SW ni el evento, no hace nada.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Suprimir prompt nativo de instalación en desktop.
    const handleBeforeInstallPrompt = (e: Event) => {
      if (!isMobileLike()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 2. Registrar SW (diferido para no bloquear LCP).
    let swTimeout: ReturnType<typeof setTimeout> | null = null;
    if ("serviceWorker" in navigator) {
      swTimeout = setTimeout(() => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[sw] registration failed", err);
          });
      }, 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (swTimeout) clearTimeout(swTimeout);
    };
  }, []);
  return null;
}
