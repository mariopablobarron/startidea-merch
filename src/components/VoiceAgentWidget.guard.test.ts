import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/VoiceAgentWidget.tsx"),
  "utf8",
);

describe("guard: David no compite con la compra en móvil", () => {
  it("suprime el nudge automático en catálogo y fichas", () => {
    expect(source).toContain('pathname === "/catalogo" || pathname.startsWith("/catalogo/")');
    expect(source).toMatch(
      /if \(suppressAutomaticNudge\) \{\s*setNudge\(false\);\s*return;/,
    );
    expect(source).toContain(
      "nudge && !suppressAutomaticNudge && !open && !isActive && !isConnecting",
    );
  });

  it("cede el espacio inferior al propietario comercial en móvil", () => {
    expect(source).toContain("mobileFloatingOwner({");
    expect(source).toContain(
      'mobileOwner !== FLOATING_SURFACES.assistantLauncher && "hidden md:flex"',
    );
    expect(source).toContain(
      "data-floating-surface={FLOATING_SURFACES.assistantLauncher}",
    );
    expect(source).toContain(
      "bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)]",
    );
    expect(source).toContain('className="hidden md:inline"');
  });

  it("identifica la IA, expone el diálogo y respeta movimiento reducido", () => {
    expect(source).toContain("asistente virtual con IA");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-controls="voice-agent-dialog"');
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("motion-safe:animate-pulse");
  });

  it("no añade productos multivariante sin una selección exacta", () => {
    const cards = readFileSync(
      join(process.cwd(), "src/app/api/products/cards/route.ts"),
      "utf8",
    );
    const refusal = source.indexOf("if (card.requiresVariantSelection)");
    const add = source.indexOf("addItem({", refusal);

    expect(refusal).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(refusal);
    expect(source.slice(refusal, add)).toContain("No lo he añadido");
    expect(source).toContain("variantId: card.variantId");
    expect(source).not.toContain("variantSku: card.");
    expect(cards).toContain("variantId: p._count.variants === 1");
    expect(cards).toContain("requiresVariantSelection: p._count.variants > 1");
    expect(cards).not.toMatch(/select:\s*\{\s*sku:\s*true/);
  });
});
