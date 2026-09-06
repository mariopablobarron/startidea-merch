import Link from "next/link";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { prisma } from "@/lib/prisma";

/**
 * Banda fina con la promoción activa más relevante. Se renderiza encima
 * del contenido en home y se oculta si no hay promos vigentes con
 * `displayInList=true`. Sirve para anunciar Black Friday / liquidaciones
 * de temporada / etc. sin tener que tocar el copy del Hero.
 *
 * Lógica de prioridad cuando hay varias:
 *   1. La de scope ALL (afecta a todo el catálogo) gana
 *   2. Si no, la que más descuento aplique (mayor value para PERCENT)
 *   3. Empate → la que termina antes
 */
export async function ActivePromotionBar() {
  const promos = (await loadActivePromotions()).filter((p) => p.displayInList);
  if (promos.length === 0) return null;

  // Prioridad
  const sorted = [...promos].sort((a, b) => {
    if (a.scope === "ALL" && b.scope !== "ALL") return -1;
    if (b.scope === "ALL" && a.scope !== "ALL") return 1;
    if (a.value !== b.value) return b.value - a.value;
    const aEnd = a.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bEnd = b.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });
  const promo = sorted[0]!;

  // CTA según scope
  let ctaHref = "/promociones";
  let scopeText = "Ver promociones";
  if (promo.scope === "ALL") {
    ctaHref = "/catalogo";
    scopeText = "Ver catálogo";
  } else if (promo.scope === "CATEGORY" && promo.targetIds[0]) {
    const cat = await prisma.category.findUnique({
      where: { id: promo.targetIds[0] },
      select: { slug: true, name: true },
    });
    if (cat) {
      ctaHref = `/catalogo?cat=${cat.slug}`;
      scopeText = `Ver ${cat.name}`;
    }
  } else if (promo.scope === "PRODUCT_LIST" && promo.targetIds[0]) {
    const p = await prisma.product.findUnique({
      where: { id: promo.targetIds[0] },
      select: { slug: true, name: true },
    });
    if (p) {
      ctaHref = `/catalogo/${p.slug}`;
      scopeText = `Ver ${p.name}`;
    }
  }

  const ends = promo.endsAt
    ? new Date(promo.endsAt).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div
      className="border-y border-bone/20 text-bone"
      style={{ background: promo.badgeColor || "#C41D51" }}
    >
      <div className="mx-auto flex max-w-8xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm lg:px-10">
        <p className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-bone/25 px-3 py-1 font-display text-xs font-bold uppercase tracking-wider">
            {getBadgeText(promo)}
          </span>
          <span className="font-medium">{promo.name}</span>
          {promo.description && (
            <span className="hidden text-xs opacity-90 md:inline">· {promo.description}</span>
          )}
          {ends && (
            <span className="text-xs opacity-90">· hasta {ends}</span>
          )}
        </p>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1 rounded-full bg-bone/20 px-4 py-1.5 text-xs font-semibold transition hover:bg-bone/35"
        >
          {scopeText}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
