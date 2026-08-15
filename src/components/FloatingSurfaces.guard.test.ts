import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guard: una sola superficie inferior en móvil", () => {
  it("conecta todos los overlays al contrato central", () => {
    const participants = [
      "src/components/CartBanner.tsx",
      "src/components/CompareBanner.tsx",
      "src/components/CookieBanner.tsx",
      "src/components/ProductOrderForm.tsx",
      "src/components/StickyMobileCta.tsx",
      "src/components/VoiceAgentWidget.tsx",
      "src/components/Tour.tsx",
      "src/components/EmailCapturePopup.tsx",
      "src/components/SpinWheelPopup.tsx",
    ];

    for (const path of participants) {
      expect(source(path), path).toContain("data-floating-surface=");
    }
    expect(source("src/app/layout.tsx")).toContain(
      "<style>{floatingSurfacePriorityCss()}</style>",
    );
    expect(source("src/app/layout.tsx")).toContain(
      "<FloatingSurfaceCoordinator />",
    );
    expect(source("src/components/FloatingSurfaceCoordinator.tsx")).toContain(
      'element.dataset.floatingSuppressed = "true"',
    );
  });

  it("deja WhatsApp solo en escritorio y lo retira de funnels con CTA propio", () => {
    const whatsapp = source("src/components/WhatsAppFloat.tsx");
    expect(whatsapp).toContain("hidden size-16");
    expect(whatsapp).toContain("md:inline-flex");
    expect(whatsapp).not.toContain("data-floating-surface=");

    for (const path of [
      "src/app/page.tsx",
      "src/app/catalogo/[slug]/page.tsx",
      "src/app/carrito/page.tsx",
    ]) {
      expect(source(path), path).not.toContain("<WhatsAppFloat");
    }
  });

  it("aplica safe-area y evita mostrar el sticky antes de rebasar acciones", () => {
    for (const path of [
      "src/components/CartBanner.tsx",
      "src/components/CompareBanner.tsx",
      "src/components/CookieBanner.tsx",
      "src/components/ProductOrderForm.tsx",
      "src/components/StickyMobileCta.tsx",
      "src/components/VoiceAgentWidget.tsx",
    ]) {
      expect(source(path), path).toContain("env(safe-area-inset-bottom)");
    }
    expect(source("src/components/ProductOrderForm.tsx")).toContain(
      "shouldShowStickyActions({",
    );
    expect(source("src/app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("conserva el receptor inline de David en carrito y gestiona foco modal", () => {
    expect(source("src/components/CartPage.tsx")).toContain("<AskDiego");
    expect(source("src/components/VoiceAgentGate.tsx")).toContain(
      "isVoiceAgentMountedOnPath(pathname)",
    );
    const voice = source("src/components/VoiceAgentWidget.tsx");
    expect(voice).toContain("launcherAllowed && !isActive && !isConnecting");
    expect(voice).toContain("useModalFocus({");
    expect(voice).toContain('aria-modal="true"');
    expect(voice).toContain(
      "data-floating-surface={FLOATING_SURFACES.assistantSheet}",
    );
  });
});
