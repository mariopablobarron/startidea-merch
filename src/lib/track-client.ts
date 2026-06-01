/**
 * Helper client-side para tracking de eventos producto.
 * Fire-and-forget. Sin esperar respuesta, sin bloquear UX.
 *
 * Acepta productId (cuando lo tienes) o slug (cuando solo conoces el slug,
 * como en el carrito que guarda por slug).
 */
export function trackProductEvent(
  ref: { productId?: string; slug?: string },
  event: "view" | "cart_add" | "proposal" | "recommender",
): void {
  if (typeof window === "undefined") return;
  if (!ref.productId && !ref.slug) return;
  try {
    fetch("/api/track/product-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ref, event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
