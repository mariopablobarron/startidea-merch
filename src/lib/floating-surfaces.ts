export const FLOATING_SURFACES = {
  consent: "consent",
  tourDialog: "tour-dialog",
  entryDialog: "entry-dialog",
  assistantSheet: "assistant-sheet",
  assistantDialog: "assistant-dialog",
  transactional: "transactional",
  cart: "cart",
  compare: "compare",
  whatsapp: "whatsapp",
  assistantLauncher: "assistant-launcher",
} as const;

export type FloatingSurface =
  (typeof FLOATING_SURFACES)[keyof typeof FLOATING_SURFACES];

/**
 * Una sola superficie interactiva puede ocupar el borde inferior en móvil.
 * La primera superficie activa de esta lista gana y CSS oculta las inferiores.
 */
export const FLOATING_SURFACE_PRIORITY: readonly FloatingSurface[] = [
  FLOATING_SURFACES.consent,
  FLOATING_SURFACES.tourDialog,
  FLOATING_SURFACES.entryDialog,
  FLOATING_SURFACES.assistantSheet,
  FLOATING_SURFACES.assistantDialog,
  FLOATING_SURFACES.transactional,
  FLOATING_SURFACES.cart,
  FLOATING_SURFACES.compare,
  FLOATING_SURFACES.assistantLauncher,
];

const ROUTE_EXCLUSIONS: Partial<Record<FloatingSurface, readonly string[]>> = {
  [FLOATING_SURFACES.cart]: [
    "/carrito",
    "/comparar",
    "/cotizar",
    "/pay",
    "/clientes",
    "/review",
    "/proof",
    "/share",
    "/afiliado",
    "/newsletter/unsubscribe",
    "/admin",
    "/api",
  ],
  [FLOATING_SURFACES.compare]: [
    "/comparar",
    "/carrito",
    "/cotizar",
    "/pay",
    "/clientes",
    "/review",
    "/proof",
    "/share",
    "/afiliado",
    "/newsletter/unsubscribe",
    "/admin",
    "/api",
  ],
  [FLOATING_SURFACES.whatsapp]: [
    // La ficha ya ofrece un CTA WhatsApp inline con producto y referencia.
    "/catalogo/",
    "/carrito",
    "/cotizar",
    "/pay",
    "/clientes",
    "/review",
    "/proof",
    "/share",
    "/afiliado",
    "/newsletter/unsubscribe",
    "/admin",
    "/api",
  ],
  [FLOATING_SURFACES.assistantLauncher]: [
    "/carrito",
    "/comparar",
    "/cotizar",
    "/pay",
    "/clientes",
    "/review",
    "/proof",
    "/share",
    "/afiliado",
    "/newsletter/unsubscribe",
    "/admin",
    "/api",
  ],
};

function matchesPath(pathname: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isFloatingSurfaceAllowedOnPath(
  surface: FloatingSurface,
  pathname: string,
): boolean {
  return !ROUTE_EXCLUSIONS[surface]?.some((prefix) =>
    matchesPath(pathname, prefix),
  );
}

export function pickHighestPrioritySurface(
  active: Iterable<FloatingSurface>,
): FloatingSurface | null {
  const activeSet = new Set(active);
  return (
    FLOATING_SURFACE_PRIORITY.find((surface) => activeSet.has(surface)) ?? null
  );
}

export function floatingSurfacePriority(surface: FloatingSurface): number {
  const priority = FLOATING_SURFACE_PRIORITY.indexOf(surface);
  return priority === -1 ? Number.POSITIVE_INFINITY : priority;
}

/**
 * El motor debe seguir montado en el carrito porque sus CTAs inline emiten
 * `diego:open`. La política del launcher es distinta a la disponibilidad del
 * diálogo: en el carrito se permite el diálogo solicitado, nunca el flotante.
 */
export function isVoiceAgentMountedOnPath(pathname: string): boolean {
  return (
    matchesPath(pathname, "/carrito") ||
    isFloatingSurfaceAllowedOnPath(
      FLOATING_SURFACES.assistantLauncher,
      pathname,
    )
  );
}

export type MobileFloatingOwner =
  | "home-cta"
  | "product-cta"
  | typeof FLOATING_SURFACES.cart
  | typeof FLOATING_SURFACES.compare
  | typeof FLOATING_SURFACES.assistantLauncher
  | null;

export function mobileFloatingOwner(input: {
  pathname: string;
  cartCount: number;
  compareCount: number;
}): MobileFloatingOwner {
  if (input.pathname === "/") return "home-cta";
  if (input.pathname.startsWith("/catalogo/")) return "product-cta";
  if (
    input.cartCount > 0 &&
    isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.cart, input.pathname)
  ) {
    return FLOATING_SURFACES.cart;
  }
  if (
    input.compareCount > 0 &&
    isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.compare, input.pathname)
  ) {
    return FLOATING_SURFACES.compare;
  }
  if (
    isFloatingSurfaceAllowedOnPath(
      FLOATING_SURFACES.assistantLauncher,
      input.pathname,
    )
  ) {
    return FLOATING_SURFACES.assistantLauncher;
  }
  return null;
}

/**
 * IntersectionObserver también informa "no visible" cuando las acciones aún
 * están por debajo del viewport. El sticky solo debe aparecer después de que
 * el usuario las haya rebasado por arriba.
 */
export function shouldShowStickyActions(input: {
  isIntersecting: boolean;
  top: number;
}): boolean {
  return !input.isIntersecting && input.top < 0;
}

export function shouldShowStickyActionsForRect(input: {
  top: number;
  bottom: number;
  viewportHeight: number;
}): boolean {
  return shouldShowStickyActions({
    isIntersecting: input.bottom > 0 && input.top < input.viewportHeight,
    top: input.top,
  });
}

export function floatingSurfacePriorityCss(): string {
  const selectors: string[] = [];
  for (let high = 0; high < FLOATING_SURFACE_PRIORITY.length; high++) {
    for (let low = high + 1; low < FLOATING_SURFACE_PRIORITY.length; low++) {
      selectors.push(
        `body:has([data-floating-surface="${FLOATING_SURFACE_PRIORITY[high]}"]) [data-floating-surface="${FLOATING_SURFACE_PRIORITY[low]}"]`,
      );
    }
  }

  return `@media (max-width: 767px) {
${selectors.join(",\n")} {
  display: none !important;
}

[data-floating-suppressed="true"] {
  display: none !important;
}
}`;
}
