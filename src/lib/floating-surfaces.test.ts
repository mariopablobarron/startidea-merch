import { describe, expect, it } from "vitest";
import {
  FLOATING_SURFACES,
  FLOATING_SURFACE_PRIORITY,
  floatingSurfacePriority,
  floatingSurfacePriorityCss,
  isFloatingSurfaceAllowedOnPath,
  isVoiceAgentMountedOnPath,
  mobileFloatingOwner,
  pickHighestPrioritySurface,
  shouldShowStickyActions,
} from "./floating-surfaces";

describe("floating surfaces", () => {
  it("elige una sola superficie por prioridad", () => {
    expect(
      pickHighestPrioritySurface([
        FLOATING_SURFACES.tourDialog,
        FLOATING_SURFACES.assistantLauncher,
        FLOATING_SURFACES.whatsapp,
        FLOATING_SURFACES.compare,
      ]),
    ).toBe(FLOATING_SURFACES.tourDialog);
    expect(
      pickHighestPrioritySurface([
        FLOATING_SURFACES.cart,
        FLOATING_SURFACES.transactional,
        FLOATING_SURFACES.consent,
      ]),
    ).toBe(FLOATING_SURFACES.consent);
    expect(pickHighestPrioritySurface([])).toBeNull();
    expect(floatingSurfacePriority(FLOATING_SURFACES.consent)).toBe(0);
    expect(floatingSurfacePriority(FLOATING_SURFACES.whatsapp)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("genera una regla móvil para cada par de prioridades", () => {
    const css = floatingSurfacePriorityCss();
    const expectedPairs =
      (FLOATING_SURFACE_PRIORITY.length *
        (FLOATING_SURFACE_PRIORITY.length - 1)) /
      2;

    expect(css).toContain("@media (max-width: 767px)");
    expect(css.match(/body:has\(/g)).toHaveLength(expectedPairs);
    expect(css).toContain(
      'body:has([data-floating-surface="transactional"]) [data-floating-surface="compare"]',
    );
    expect(css).toContain("display: none !important");
  });

  it("suprime distracciones en rutas transaccionales o privadas", () => {
    expect(
      isFloatingSurfaceAllowedOnPath(
        FLOATING_SURFACES.whatsapp,
        "/catalogo/boligrafo",
      ),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.whatsapp, "/catalogo"),
    ).toBe(true);
    expect(
      isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.cart, "/admin/products"),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.compare, "/comparar"),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(
        FLOATING_SURFACES.assistantLauncher,
        "/clientes/acceso",
      ),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.compare, "/proof/token"),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.cart, "/cotizar"),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(
        FLOATING_SURFACES.assistantLauncher,
        "/afiliado/token",
      ),
    ).toBe(false);
    expect(
      isFloatingSurfaceAllowedOnPath(
        FLOATING_SURFACES.cart,
        "/newsletter/unsubscribe/token",
      ),
    ).toBe(false);
  });

  it("mantiene el diálogo inline de David en carrito sin habilitar launcher", () => {
    expect(isVoiceAgentMountedOnPath("/carrito")).toBe(true);
    expect(isVoiceAgentMountedOnPath("/carrito/")).toBe(true);
    expect(
      isFloatingSurfaceAllowedOnPath(
        FLOATING_SURFACES.assistantLauncher,
        "/carrito",
      ),
    ).toBe(false);
    expect(isVoiceAgentMountedOnPath("/pay/token")).toBe(false);
  });

  it("muestra el sticky solo después de rebasar las acciones", () => {
    expect(shouldShowStickyActions({ isIntersecting: false, top: 420 })).toBe(
      false,
    );
    expect(shouldShowStickyActions({ isIntersecting: true, top: 120 })).toBe(
      false,
    );
    expect(shouldShowStickyActions({ isIntersecting: false, top: -1 })).toBe(
      true,
    );
  });

  it("reserva portada y ficha y arbitra el resto del móvil", () => {
    expect(
      mobileFloatingOwner({ pathname: "/", cartCount: 1, compareCount: 1 }),
    ).toBe("home-cta");
    expect(
      mobileFloatingOwner({
        pathname: "/catalogo/producto",
        cartCount: 1,
        compareCount: 1,
      }),
    ).toBe("product-cta");
    expect(
      mobileFloatingOwner({
        pathname: "/catalogo",
        cartCount: 1,
        compareCount: 1,
      }),
    ).toBe(FLOATING_SURFACES.cart);
    expect(
      mobileFloatingOwner({
        pathname: "/catalogo",
        cartCount: 0,
        compareCount: 1,
      }),
    ).toBe(FLOATING_SURFACES.compare);
    expect(
      mobileFloatingOwner({
        pathname: "/catalogo",
        cartCount: 0,
        compareCount: 0,
      }),
    ).toBe(FLOATING_SURFACES.assistantLauncher);
    expect(
      mobileFloatingOwner({
        pathname: "/carrito",
        cartCount: 0,
        compareCount: 0,
      }),
    ).toBeNull();
    expect(
      mobileFloatingOwner({
        pathname: "/comparar",
        cartCount: 1,
        compareCount: 1,
      }),
    ).toBeNull();
  });
});
