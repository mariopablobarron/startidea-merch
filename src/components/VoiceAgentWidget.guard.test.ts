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

  it("mantiene un lanzador compacto y separado de la barra inferior en móvil", () => {
    expect(source).toContain("bottom-[calc(env(safe-area-inset-bottom)_+_6rem)]");
    expect(source).toMatch(/className="[^"]*h-12 w-12[^"]*sm:h-auto sm:w-auto/);
    expect(source).toContain('<span className="hidden sm:inline">Habla o escribe a {agentName}</span>');
  });

  it("identifica la IA, expone el diálogo y respeta movimiento reducido", () => {
    expect(source).toContain("asistente virtual con IA");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-controls="voice-agent-dialog"');
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("motion-safe:animate-pulse");
  });
});
