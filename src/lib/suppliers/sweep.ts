import { prisma } from "@/lib/prisma";

/**
 * Sweep post-sync: desactiva productos activos sin precio cerrado
 * (fromPriceCents null o ≤ 0). Sin precio no se pueden cotizar ni
 * vender, así que mantenerlos activos pollute catálogo, sitemap y
 * carrito (bloquea pago directo con tarjeta).
 *
 * El sync upsert siempre fuerza active=true; este sweep corrige el
 * caso particular en que el feed del supplier no incluye precio para
 * ciertos productos (descatalogados, kits, items huérfanos).
 *
 * @param supplier nombre del supplier (midocean | makito | cifra) — si
 *                  se omite, aplica a todos los productos.
 * @returns número de productos desactivados.
 */
export async function deactivateUnpricedProducts(
  supplier?: "midocean" | "makito" | "cifra",
): Promise<number> {
  const result = await prisma.product.updateMany({
    where: {
      active: true,
      OR: [
        { fromPriceCents: null },
        { fromPriceCents: { lte: 0 } },
      ],
      ...(supplier ? { supplier } : {}),
    },
    data: { active: false },
  });
  if (result.count > 0) {
    console.log(
      `[sweep] desactivados ${result.count} productos${supplier ? ` de ${supplier}` : ""} sin precio cerrado`,
    );
  }
  return result.count;
}
