/**
 * Mensaje de la página de baja de la newsletter.
 *
 * Vive aquí, y no en el route handler, para que los tests puedan ejercitar
 * **esta misma función** en vez de una copia: un test que reimplementa la
 * interpolación se queda verde justo cuando quitan el escape del handler.
 *
 * El fallo que arregla: `GET /api/newsletter/unsubscribe?email=…` devuelve el
 * email tal cual llegó, exista o no en BD (deliberado: no revelamos quién está
 * suscrito), y la respuesta es `text/html` servido desde nuestro dominio — el
 * mismo origen que `/admin` y `/clientes`, y sin CSP. Comprobado contra
 * producción el 21-ago-2026: `<img src=x onerror=alert(1)>` llegaba entero.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto (ya como HTML seguro) que se pinta dentro del `<p>` de la página. */
export function unsubscribeMessage(r: { ok: boolean; email?: string; reason?: string }): string {
  if (r.ok) {
    const marca = r.email ? ` <b>${escapeHtml(r.email)}</b>` : "";
    return `Tu email${marca} ya no recibirá más emails de marketing. Sigues pudiendo pedir cotización con normalidad.`;
  }
  return `${escapeHtml(r.reason || "Error procesando la baja")}. Si el problema persiste, escríbenos a hola@startidea.es y te damos de baja manualmente.`;
}
