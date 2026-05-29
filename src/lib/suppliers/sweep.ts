import { prisma } from "@/lib/prisma";

/**
 * Sweep post-sync: oculta del catálogo público los productos que el
 * supplier envía sin precio cerrado o sin variants vendibles.
 *
 * Causa raíz (verificada 2026-05-30 investigando 36 productos):
 *
 *   MidOcean — Pricelist sync NO incluye algunos SKUs (USBs descatalogados,
 *              kits, "consultar precio"). El producto entra al catálogo
 *              vía ItemDataFile pero su tarifa no llega. fromPriceCents = NULL.
 *
 *   Makito —  ItemDataFile envía <variants></variants> literalmente vacío
 *              para textiles en transición (línea Iconic, V-Neck, Long Sleeve…).
 *              Sin variants no se pueden vender camisetas (no hay talla/color).
 *              Sin variants no se crean tiers → fromPriceCents = NULL.
 *
 *   Cifra —   PDF de tarifa trae unitPriceCents = 0 para algún producto
 *              descatalogado o marcado como "consultar". fromPriceCents = 0.
 *
 * Solución: desactivar (active=false). NO se borran — cuando el supplier
 * vuelva a enviar precio/variants en el siguiente sync, el upsert los
 * reactivará automáticamente y el sweep no los tocará (porque
 * fromPriceCents > 0).
 *
 * Sin esta limpieza:
 *  - Aparecen en catálogo público sin "Desde X €" (rompe UX y SEO)
 *  - Aparecen en sitemap.xml (URLs muertas)
 *  - Si entran al carrito, bloquean el botón de pago directo con tarjeta
 *    porque el check `allPriced` exige fromPriceCents > 0 en TODOS los items
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
      `[sweep] desactivados ${result.count} productos${supplier ? ` de ${supplier}` : ""} sin precio cerrado del feed`,
    );
  }
  return result.count;
}
