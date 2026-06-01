"use client";

import { useEffect } from "react";

/**
 * Registra UN evento "view" por sesión de navegador para cada productId.
 * Se monta en el detalle de producto (/catalogo/[slug]) y dispara
 * fire-and-forget al cargar la página.
 *
 * Dedup: usa sessionStorage para evitar contar refresh múltiples como
 * views distintas. Solo se vuelve a contar tras cerrar pestaña/navegador.
 */
export function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `pview:${productId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    // Sin await, sin bloqueo. Si falla, se ignora silencioso.
    fetch("/api/track/product-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, event: "view" }),
      keepalive: true,
    }).catch(() => {});
  }, [productId]);

  return null;
}
