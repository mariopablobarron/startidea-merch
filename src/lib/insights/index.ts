/**
 * Insights del catálogo — métricas agregadas + sugerencias derivadas.
 *
 * Pensado para el dashboard /admin/insights. Toda función devuelve un
 * shape JSON-friendly serializable por Next sin Decimal/BigInt issues.
 */
import { prisma } from "@/lib/prisma";

export type CatalogHealth = {
  totalProducts: number;
  activeProducts: number;
  totalVariants: number;
  variantsWithStock: number;
  variantsWithPrice: number;
  productsWithImage: number;
  productsWithEnhancedDesc: number;
  pctImage: number;
  pctEnhanced: number;
  pctStock: number;
};

export async function getCatalogHealth(): Promise<CatalogHealth> {
  const [
    totalProducts,
    activeProducts,
    totalVariants,
    variantsWithStock,
    variantsWithPrice,
    productsWithImage,
    productsWithEnhancedDesc,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { stockQty: { gt: 0 } } }),
    prisma.priceTier.findMany({ select: { variantId: true }, distinct: ["variantId"] }).then((r) => r.length),
    prisma.product.count({ where: { active: true, primaryImageUrl: { not: null } } }),
    prisma.product.count({ where: { active: true, enhancedShortDescription: { not: null } } }),
  ]);

  return {
    totalProducts,
    activeProducts,
    totalVariants,
    variantsWithStock,
    variantsWithPrice,
    productsWithImage,
    productsWithEnhancedDesc,
    pctImage: activeProducts > 0 ? Math.round((productsWithImage / activeProducts) * 100) : 0,
    pctEnhanced: activeProducts > 0 ? Math.round((productsWithEnhancedDesc / activeProducts) * 100) : 0,
    pctStock: totalVariants > 0 ? Math.round((variantsWithStock / totalVariants) * 100) : 0,
  };
}

export type SupplierStatus = {
  supplier: string;
  products: number;
  activeProducts: number;
  variants: number;
  variantsWithStock: number;
  pctStock: number;
  lastStockUpdate: Date | null;
  hoursStaleStock: number | null;
};

export async function getSupplierStatuses(): Promise<SupplierStatus[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      supplier: string;
      products: bigint;
      activeproducts: bigint;
      variants: bigint;
      variantswithstock: bigint;
      laststockupdate: Date | null;
    }>
  >`
    SELECT
      p.supplier::text AS supplier,
      COUNT(DISTINCT p.id) AS products,
      COUNT(DISTINCT p.id) FILTER (WHERE p.active = true) AS activeproducts,
      COUNT(DISTINCT v.id) AS variants,
      COUNT(DISTINCT v.id) FILTER (WHERE v."stockQty" > 0) AS variantswithstock,
      MAX(v."stockUpdatedAt") AS laststockupdate
    FROM "Product" p
    LEFT JOIN "ProductVariant" v ON v."productId" = p.id
    GROUP BY p.supplier
    ORDER BY products DESC
  `;

  const now = Date.now();
  return rows.map((r) => {
    const variants = Number(r.variants);
    const stock = Number(r.variantswithstock);
    const hours = r.laststockupdate
      ? Math.round((now - r.laststockupdate.getTime()) / 3_600_000)
      : null;
    return {
      supplier: r.supplier,
      products: Number(r.products),
      activeProducts: Number(r.activeproducts),
      variants,
      variantsWithStock: stock,
      pctStock: variants > 0 ? Math.round((stock / variants) * 100) : 0,
      lastStockUpdate: r.laststockupdate,
      hoursStaleStock: hours,
    };
  });
}

export type TopProductRow = {
  productId: string;
  slug: string;
  name: string;
  internalRef: string | null;
  primaryImageUrl: string | null;
  supplier: string;
  viewCount: number;
  cartAddCount: number;
  proposalCount: number;
  view30d: number;
  lastViewedAt: Date | null;
};

export async function getTopViewedProducts(limit = 20, window: "all" | "30d" = "30d"): Promise<TopProductRow[]> {
  const order = window === "30d" ? { view30d: "desc" as const } : { viewCount: "desc" as const };
  const views = await prisma.productView.findMany({
    orderBy: [order],
    take: limit,
    select: {
      productId: true,
      viewCount: true,
      cartAddCount: true,
      proposalCount: true,
      view30d: true,
      lastViewedAt: true,
      product: {
        select: {
          slug: true,
          name: true,
          internalRef: true,
          primaryImageUrl: true,
          supplier: true,
        },
      },
    },
  });

  return views.map((v) => ({
    productId: v.productId,
    slug: v.product.slug,
    name: v.product.name,
    internalRef: v.product.internalRef,
    primaryImageUrl: v.product.primaryImageUrl,
    supplier: v.product.supplier,
    viewCount: v.viewCount,
    cartAddCount: v.cartAddCount,
    proposalCount: v.proposalCount,
    view30d: v.view30d,
    lastViewedAt: v.lastViewedAt,
  }));
}

export type Suggestion = {
  id: string;
  severity: "critical" | "warning" | "info" | "opportunity";
  title: string;
  body: string;
  action?: { label: string; href: string };
  metric?: string;
};

/**
 * Genera sugerencias accionables a partir del estado del catálogo,
 * proveedores y métricas de engagement. Combina varias señales:
 * - Salud de la sincronización con proveedores
 * - Cobertura de imágenes y descripciones enhanced
 * - Productos populares sin contenido óptimo
 * - Recomendaciones del recomendador IA sin conversión
 */
export async function getSuggestions(): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];
  const health = await getCatalogHealth();
  const suppliers = await getSupplierStatuses();

  // 1. Sync proveedores stale
  for (const s of suppliers) {
    if (s.hoursStaleStock !== null && s.hoursStaleStock > 26) {
      suggestions.push({
        id: `sync-stale-${s.supplier}`,
        severity: s.hoursStaleStock > 72 ? "critical" : "warning",
        title: `Stock de ${s.supplier} desactualizado (${s.hoursStaleStock}h)`,
        body: `La última actualización de stock fue hace ${s.hoursStaleStock}h. Revisa el cron de sincronización; el catálogo puede estar mostrando stock que ya no existe.`,
        action: { label: "Ver crons", href: "/admin/system/crons" },
        metric: `${s.hoursStaleStock}h sin sync`,
      });
    }
    if (s.variants > 0 && s.pctStock === 0) {
      suggestions.push({
        id: `no-stock-${s.supplier}`,
        severity: "critical",
        title: `${s.supplier} reporta 0 variantes con stock`,
        body: `Las ${s.variants} variantes del proveedor están a 0 unidades. Probable bug en el parser de stock o cambio de formato del proveedor.`,
        action: { label: "Investigar sync", href: `/admin/system/crons` },
      });
    }
  }

  // 2. Cobertura imagen
  if (health.pctImage < 95 && health.activeProducts > 0) {
    const missing = health.activeProducts - health.productsWithImage;
    suggestions.push({
      id: "missing-images",
      severity: "warning",
      title: `${missing} productos activos sin imagen principal`,
      body: `Productos sin imagen casi nunca convierten. Solo el ${health.pctImage}% del catálogo tiene imagen. Considera filtrar estos productos para que no aparezcan en home/catálogo hasta tener foto.`,
      action: { label: "Filtrar en admin", href: "/admin/products?missingImage=1" },
      metric: `${missing} sin imagen`,
    });
  }

  // 3. Descripciones enhanced
  if (health.pctEnhanced < 30 && health.activeProducts > 0) {
    const missing = health.activeProducts - health.productsWithEnhancedDesc;
    suggestions.push({
      id: "missing-enhanced-desc",
      severity: "opportunity",
      title: `${missing} productos sin descripción IA mejorada`,
      body: `Solo el ${health.pctEnhanced}% del catálogo tiene descripción comercial mejorada por IA. Las descripciones IA convierten 2-3× mejor que las del proveedor. Hay cron disponible para enriquecer en batch.`,
      action: { label: "Ejecutar enriquecimiento", href: "/admin/system/crons" },
      metric: `${health.pctEnhanced}% cobertura`,
    });
  }

  // 4. Productos populares — análisis de top viewed
  const top = await getTopViewedProducts(20, "30d");
  const popularSinImagen = top.filter((p) => !p.primaryImageUrl);
  if (popularSinImagen.length > 0) {
    suggestions.push({
      id: "popular-no-image",
      severity: "critical",
      title: `${popularSinImagen.length} productos del top 20 SIN imagen`,
      body: `Productos muy vistos que no tienen foto principal. Cada visita es una conversión perdida. Subir imagen es el ROI más alto que puedes hacer hoy.`,
      action: { label: "Ver listado", href: "/admin/insights#top-productos" },
    });
  }

  // 5. Productos visto pero no añadido a carrito
  const seenNoCart = top.filter((p) => p.view30d > 10 && p.cartAddCount === 0);
  if (seenNoCart.length > 0) {
    suggestions.push({
      id: "view-no-cart",
      severity: "warning",
      title: `${seenNoCart.length} productos populares sin añadidos al carrito`,
      body: `Productos con >10 views en 30d que nunca acabaron en una cotización. Revisa precio, descripción o disponibilidad — algo bloquea la conversión.`,
      action: { label: "Ver listado", href: "/admin/insights#top-productos" },
    });
  }

  // 6. Promociones expiradas
  const expired = await prisma.promotion.count({
    where: {
      active: true,
      endsAt: { lt: new Date() },
    },
  });
  if (expired > 0) {
    suggestions.push({
      id: "expired-promotions",
      severity: "info",
      title: `${expired} promociones expiradas siguen activas`,
      body: "Promociones marcadas como activas pero cuya fecha de fin ya pasó. Limpiar para que no aparezcan en el panel.",
      action: { label: "Ver promociones", href: "/admin/promotions" },
    });
  }

  // 7. Sin cotizaciones recientes
  const recentQuotes = await prisma.recommenderQuery.count({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
  });
  if (recentQuotes === 0) {
    suggestions.push({
      id: "no-recent-quotes",
      severity: "info",
      title: "Cero consultas en el recomendador últimos 7 días",
      body: "Considera publicar el recomendador en redes o activar una campaña. El tráfico al recomendador suele convertir 4-6× mejor que al catálogo plano.",
      action: { label: "Ver recomendador", href: "/recomendador" },
    });
  } else {
    suggestions.push({
      id: "recent-quotes-info",
      severity: "info",
      title: `${recentQuotes} consultas al recomendador esta semana`,
      body: "Volumen activo. Revisa cuáles convirtieron a propuesta y cuáles se quedaron sin email.",
      action: { label: "Ver consultas", href: "/admin/recomendador" },
      metric: `${recentQuotes} consultas`,
    });
  }

  return suggestions;
}
