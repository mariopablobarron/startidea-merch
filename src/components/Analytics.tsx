"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/track";

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const slug = pathname?.startsWith("/catalogo/") ? pathname.replace("/catalogo/", "") : undefined;
    trackEvent({
      type: "pageview",
      productSlug: slug,
      payload: { qs: searchParams?.toString() || undefined },
    });
  }, [pathname, searchParams]);
  return null;
}

/**
 * Tracking automático de pageview en cada navegación cliente.
 * Eventos custom se llaman directamente desde los componentes con `trackEvent()`.
 *
 * Envuelto en Suspense para no forzar CSR-bailout en páginas con SSG.
 */
export function Analytics() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}
