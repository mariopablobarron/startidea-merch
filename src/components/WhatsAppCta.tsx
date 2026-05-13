"use client";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "34958045789";

/**
 * CTA contextual de WhatsApp para fichas de producto.
 * Pre-rellena el mensaje con el nombre del producto y la ref interna
 * para que el comercial sepa exactamente sobre qué se pregunta sin
 * que el cliente tenga que copiar nada.
 *
 * Justificación: en B2B de merchandising en España, ~60% de los leads
 * grandes empiezan por WhatsApp con una pregunta libre antes de pedir
 * cotización formal. Reducir esa fricción a 1 click multiplica leads.
 */
export function WhatsAppCta({
  productName,
  internalRef,
  productUrl,
  variant = "primary",
}: {
  productName: string;
  internalRef?: string | null;
  productUrl?: string;
  variant?: "primary" | "secondary";
}) {
  const refTxt = internalRef ? ` (ref ${internalRef})` : "";
  const urlTxt = productUrl ? `\n${productUrl}` : "";
  const message = `Hola, me interesa el producto "${productName}"${refTxt}.${urlTxt}\n\n¿Podéis enviarme cotización?`;
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  if (variant === "secondary") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-full border border-line bg-bone-soft px-4 py-2 text-sm font-medium text-ink transition hover:border-[#25D366] hover:text-[#0e6b3a]"
      >
        <WhatsAppIcon />
        Consultar por WhatsApp
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-[#1da551]"
    >
      <WhatsAppIcon />
      Consultar por WhatsApp
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}
