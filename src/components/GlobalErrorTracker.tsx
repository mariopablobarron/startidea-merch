"use client";

import { useEffect } from "react";

/**
 * Captura errors no manejados del navegador (window.onerror y
 * unhandledrejection) y los envía a /api/internal/log-error.
 *
 * Montado en el root layout (server component padre).
 * Sin auth (rate-limited en el endpoint).
 *
 * Filtra ruido típico de extensiones de Chrome y errors esperados.
 */
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Script error\.?$/i, // CORS de scripts externos sin error info útil
  /chrome-extension/i,
  /moz-extension/i,
  /safari-extension/i,
  /Failed to fetch.*chrome-extension/i,
];

function shouldIgnore(message: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(message));
}

async function logError(payload: {
  message: string;
  stack?: string;
  url?: string;
  context: string;
}) {
  try {
    await fetch("/api/internal/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Silencioso — perder un error es mejor que loopear
  }
}

export function GlobalErrorTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onError(event: ErrorEvent) {
      const msg = event.message || "Unknown error";
      if (shouldIgnore(msg)) return;
      void logError({
        message: msg.slice(0, 2000),
        stack: event.error?.stack?.slice(0, 5000),
        url: window.location.href.slice(0, 500),
        context: "window.onerror",
      });
    }

    function onUnhandled(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      if (shouldIgnore(msg)) return;
      void logError({
        message: msg.slice(0, 2000),
        stack: reason instanceof Error ? reason.stack?.slice(0, 5000) : undefined,
        url: window.location.href.slice(0, 500),
        context: "unhandledrejection",
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return null;
}
