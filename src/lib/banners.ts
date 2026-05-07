import type { BannerSlot, MarketingBanner } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Lee banners activos para un slot dado en el momento actual.
 * Aplica reglas:
 *   - active = true
 *   - startsAt <= now (o null)
 *   - endsAt >= now (o null)
 * Ordena por priority desc, luego createdAt desc.
 *
 * Usado por server components que renderizan slots (BannerSlot.tsx).
 * Tolerante a fallos de DB (devuelve [] en error para no romper render).
 */
export async function getActiveBanners(
  slot: BannerSlot,
  limit = 3,
): Promise<MarketingBanner[]> {
  try {
    const now = new Date();
    return await prisma.marketingBanner.findMany({
      where: {
        slot,
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  } catch {
    return [];
  }
}

export const BANNER_SLOTS: BannerSlot[] = [
  "HOME_TOP",
  "HOME_MID",
  "CATALOGO_TOP",
  "FICHA_PRODUCTO",
  "FOOTER",
];

export const BANNER_SLOT_LABELS: Record<BannerSlot, string> = {
  HOME_TOP: "Home — bajo el hero",
  HOME_MID: "Home — entre secciones",
  CATALOGO_TOP: "Catálogo — sobre los filtros",
  FICHA_PRODUCTO: "Ficha de producto",
  FOOTER: "Footer (todas las páginas)",
};
