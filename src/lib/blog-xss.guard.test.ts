import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("guard: fronteras XSS del blog", () => {
  it("sanea después de inyectar enlaces y antes del sink HTML", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "blog", "[slug]", "page.tsx"),
      "utf8",
    );
    const injection = page.indexOf("html = injectInternalLinks(");
    const finalSanitizer = page.indexOf("html = sanitizeBlogHtml(html);");
    const sink = page.indexOf("dangerouslySetInnerHTML={{ __html: html }}");

    expect(injection, "ya no se encontró la inyección de enlaces internos").toBeGreaterThan(-1);
    expect(finalSanitizer, "falta la frontera final sanitizeBlogHtml").toBeGreaterThan(injection);
    expect(sink, "ya no se encontró el sink público del blog").toBeGreaterThan(finalSanitizer);
  });

  it("el componente JSON-LD usa el serializador que neutraliza </script>", () => {
    const component = readFileSync(
      join(process.cwd(), "src", "components", "JsonLd.tsx"),
      "utf8",
    );

    expect(component).toContain("dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}");
    expect(component).not.toContain("dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}");

    const pillar = readFileSync(
      join(process.cwd(), "src", "components", "pillar", "PillarShell.tsx"),
      "utf8",
    );
    expect(pillar).toContain("dangerouslySetInnerHTML={{ __html: serializeJsonLd(json) }}");
    expect(pillar).not.toContain("dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}");
  });
});
