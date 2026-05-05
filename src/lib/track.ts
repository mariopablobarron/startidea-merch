/**
 * Helper de tracking de eventos custom desde el cliente.
 * Usa sendBeacon (no bloquea) cuando está disponible, fallback a fetch keepalive.
 */

const SESSION_KEY = "merch:session-id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().slice(0, 36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export type TrackEventInput = {
  type: string;
  productSlug?: string;
  payload?: Record<string, unknown>;
};

export function trackEvent(input: TrackEventInput): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    type: input.type,
    path: window.location.pathname,
    productSlug: input.productSlug,
    payload: input.payload,
    sessionId: getSessionId(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/event", blob);
      return;
    }
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
