import { redirect } from "next/navigation";

/**
 * /cotizar — punto de entrada a la cotización.
 *
 * Histórico: varios sitios enlazan a /cotizar (CTA de la calculadora RSC, páginas
 * pillar, plantilla de broadcast "recordatorio") y, sobre todo, los emails de
 * carrito abandonado (cron abandoned-cart-drip y el remind manual del admin)
 * generan /cotizar?recover={cartId} como enlace "Retomar mi cotización". Pero la
 * ruta /cotizar NUNCA existió → todos esos enlaces daban 404 (fuga de conversión
 * en la recuperación de carritos).
 *
 * Fix: esta ruta resuelve el 404 redirigiendo a destino útil.
 *  - con ?recover=<id>: a la cesta (en el mismo dispositivo el carrito sigue en
 *    localStorage, que es la mayoría de los clics de recuperación). La restauración
 *    cross-device (rehidratar la cesta desde el CartQuote por id + marcar
 *    recoveredAt) queda como mejora pendiente; el id se pasa para ese futuro.
 *  - sin recover: al bloque de cotización de la home (#cotizar), igual que el CTA
 *    "Pedir cotización" del nav.
 */
export default async function CotizarPage({
  searchParams,
}: {
  searchParams: Promise<{ recover?: string }>;
}) {
  const { recover } = await searchParams;
  if (recover) redirect(`/carrito?recover=${encodeURIComponent(recover)}`);
  redirect("/#cotizar");
}
