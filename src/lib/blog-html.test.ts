import { describe, expect, it } from "vitest";
import { mdToHtml } from "./blog-generator";
import { sanitizeBlogHtml } from "./blog-html";

describe("HTML público del blog", () => {
  it("elimina HTML activo y protocolos ejecutables del Markdown almacenado", () => {
    const html = mdToHtml(`
# Guía segura

Texto legítimo.

<script>globalThis.pwned = true</script>
<img src="x" onerror="alert(1)">
<svg><script>alert(2)</script></svg>
<iframe srcdoc="<script>alert(3)</script>"></iframe>
[haz clic](javascript:alert(4))
[codificado](jav&#x61;script:alert(5))
<a href="javascript:alert(6)">directo</a>
<a href="jav&#x61;script:alert(7)">codificado directo</a>
<p style="background:url(javascript:alert(8))">sin estilo activo</p>
`);

    expect(html).toContain("<h1>Guía segura</h1>");
    expect(html).toContain("Texto legítimo");
    expect(html).not.toMatch(/<script|onerror\s*=|<svg|<iframe/i);
    expect(html).not.toMatch(/href=["']?javascript:/i);
    expect(html).not.toContain("style=");
  });

  it("conserva el Markdown editorial permitido", () => {
    const html = mdToHtml(`
## Comparativa

- **Algodón** y *RPET*
- [Catálogo](https://merchandising.startidea.es/catalogo)

| Técnica | Uso |
| --- | --- |
| Bordado | Textil |

![Producto](https://merchandising.startidea.es/producto.png)
`);

    expect(html).toContain("<h2>Comparativa</h2>");
    expect(html).toContain("<strong>Algodón</strong>");
    expect(html).toContain('<a href="https://merchandising.startidea.es/catalogo">');
    expect(html).toContain("<table>");
    expect(html).toContain('<img src="https://merchandising.startidea.es/producto.png"');
  });

  it("sanea también el HTML añadido después de convertir el Markdown", () => {
    const html = sanitizeBlogHtml(
      '<p>Ver <a href="/catalogo" class="text-accent hover:underline mala" onclick="alert(1)" target="_blank">catálogo</a></p>',
    );

    expect(html).toContain('href="/catalogo"');
    expect(html).toContain('class="text-accent hover:underline"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("mala");
  });

  it("no permite imágenes data: ni URLs protocol-relative", () => {
    const html = sanitizeBlogHtml(
      '<img src="data:image/svg+xml,<svg onload=alert(1)>"><img src="//evil.test/x.png">',
    );

    expect(html).not.toContain("data:");
    expect(html).not.toContain("//evil.test");
  });
});
