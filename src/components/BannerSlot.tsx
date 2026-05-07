import Link from "next/link";
import Image from "next/image";
import type { BannerSlot as Slot } from "@prisma/client";
import { getActiveBanners } from "@/lib/banners";

/**
 * Server component que renderiza el banner activo de un slot.
 * Si no hay banners activos para el slot, no renderiza nada (no ocupa espacio).
 *
 * Uso:
 *   <BannerSlot slot="HOME_TOP" />
 */
export async function BannerSlot({ slot }: { slot: Slot }) {
  const banners = await getActiveBanners(slot, 1);
  if (banners.length === 0) return null;

  const b = banners[0];
  const bg = b.bgColor || "#ff6b35"; // accent (coral) por defecto
  const fg = b.textColor || "#faf8f4"; // bone

  return (
    <section
      aria-label={`Promoción: ${b.title}`}
      className="border-t border-line"
      style={{ backgroundColor: bg, color: fg }}
    >
      <div className="mx-auto flex max-w-8xl flex-wrap items-center justify-between gap-6 px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex items-center gap-5 lg:gap-7">
          {b.imageUrl && (
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-white/10 lg:h-24 lg:w-24">
              <Image
                src={b.imageUrl}
                alt=""
                fill
                sizes="96px"
                className="object-contain p-1"
                unoptimized
              />
            </div>
          )}
          <div>
            <h2 className="font-display text-xl font-semibold leading-tight lg:text-2xl">
              {b.title}
            </h2>
            {b.subtitle && (
              <p className="mt-1 max-w-xl text-sm opacity-90 lg:text-base">{b.subtitle}</p>
            )}
          </div>
        </div>
        {b.ctaUrl && b.ctaLabel && (
          <Link
            href={b.ctaUrl}
            className="inline-flex items-center gap-2 rounded-full bg-white/95 px-6 py-3 text-sm font-semibold text-ink shadow transition hover:bg-white"
            style={{ color: bg }}
          >
            {b.ctaLabel} →
          </Link>
        )}
      </div>
    </section>
  );
}
