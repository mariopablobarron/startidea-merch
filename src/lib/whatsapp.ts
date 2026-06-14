/**
 * Canal WhatsApp — configuración y constructores de enlaces click-to-chat.
 * Único punto de verdad para el número (env NEXT_PUBLIC_WHATSAPP_NUMBER).
 *
 * Es el canal OUTBOUND (el cliente abre WhatsApp con un mensaje prerrellenado).
 * La recepción/auto-respuesta inbound requiere WhatsApp Business API (Meta/
 * Twilio) con número verificado — se monta aparte cuando esté la cuenta.
 */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "34627305162";

/** Enlace wa.me con mensaje prerrellenado. */
export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/**
 * Antepone un marcador de origen al mensaje. Así, si el WhatsApp se comparte
 * con un compañero, al abrir el chat se ve al instante que es un lead de la
 * web y de qué parte viene (ficha, carrito, etc.) → fácil de etiquetar/repartir.
 */
export function waWebMessage(source: string, body: string): string {
  return `🌐 Lead web · ${source}\n\n${body}`;
}

export type WaCartItem = {
  productName: string;
  productRef?: string | null;
  quantity: number;
  markingTechniqueName?: string | null;
  markingPositionId?: string | null;
};

/**
 * Mensaje de cotización con el carrito completo: el comercial recibe en
 * WhatsApp la lista de productos + cantidades + marcaje, listo para cerrar.
 */
export function waCartQuoteMessage(items: WaCartItem[], totalEur?: string): string {
  const lines = items.map((it) => {
    const ref = it.productRef ? ` (ref ${it.productRef})` : "";
    const mark = it.markingTechniqueName
      ? ` — ${it.markingTechniqueName}${it.markingPositionId ? ` en ${it.markingPositionId}` : ""}`
      : "";
    return `• ${it.quantity}× ${it.productName}${ref}${mark}`;
  });
  const body =
    `Hola, me gustaría una cotización para:\n\n${lines.join("\n")}` +
    (totalEur ? `\n\nTotal estimado: ${totalEur}` : "") +
    `\n\n¿Me lo podéis cerrar?`;
  return waWebMessage("Carrito", body);
}
