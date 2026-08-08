import { describe, expect, it } from "vitest";
import {
  groupLegacyHtmlValues,
  legacyHtmlToText,
  normalizeProductName,
  publicProductName,
} from "./product-name";

describe("legacyHtmlToText", () => {
  it.each([
    ["<p>BALÓN DE REGLAMENTO</p>", "BALÓN DE REGLAMENTO"],
    ["<p>Botella</p><p>500 ml</p>", "Botella 500 ml"],
    ["<p>Botella<br>500 ml", "Botella 500 ml"],
    ["<p class=\"x\">Camiseta <strong>Orgánica</strong></p>", "Camiseta Orgánica"],
    ['Bolsa &amp; neceser&nbsp;&#34;Eco&#34; &#x2F; 2', 'Bolsa & neceser "Eco" / 2'],
    ["&lt;p&gt;Agenda&amp;nbsp;A5&lt;/p&gt;", "Agenda A5"],
    ["&amp;amp;lt;p&amp;amp;gt;Agenda&amp;amp;lt;/p&amp;amp;gt;", "Agenda"],
  ])("convierte %s a texto plano", (input, expected) => {
    expect(legacyHtmlToText(input)).toBe(expected);
  });

  it("elimina comentarios y contenido no visible o ejecutable", () => {
    expect(
      legacyHtmlToText(
        "<p>Gorra</p><!-- nota --><script>alert(1)</script><style>.x{}</style>",
      ),
    ).toBe("Gorra");
  });

  it("encuentra cierres de script sin desalinearse por Unicode", () => {
    expect(legacyHtmlToText("<script>İİİİİ</script><p>Good</p>")).toBe("Good");
  });

  it("no confunde prefijos con el cierre real de un elemento no visible", () => {
    expect(
      legacyHtmlToText("<script>secret</scriptx>leak</script><p>Good</p>"),
    ).toBe("Good");
  });

  it("conserva comparaciones que no son etiquetas HTML", () => {
    expect(legacyHtmlToText("Talla < 5 años")).toBe("Talla < 5 años");
  });

  it("respeta > dentro de atributos y no publica fragmentos del atributo", () => {
    expect(legacyHtmlToText('<p title="1 > 0">Nombre</p>')).toBe("Nombre");
    expect(legacyHtmlToText('<p aria-label="a > b">Taza &amp; vaso</p>')).toBe(
      "Taza & vaso",
    );
  });

  it("parsea atributos antes de decodificar las comillas que contienen", () => {
    expect(legacyHtmlToText("<p title='John&apos;s > test'>Name</p>")).toBe("Name");
    expect(
      legacyHtmlToText('<p title="He said &quot;1 > 0&quot;">Name</p>'),
    ).toBe("Name");
    expect(legacyHtmlToText("<p title='John&#39;s > test'>Name</p>")).toBe("Name");
  });

  it("procesa markup malformado largo en una sola pasada lógica", () => {
    const malformed = `${"<p ".repeat(20_000)}fin`;
    expect(legacyHtmlToText(malformed)).toBe("");
  });
});

describe("normalizeProductName", () => {
  it.each([null, undefined, "", "   ", "<p><br></p>"])(
    "usa el fallback seguro para %s",
    (input) => {
      expect(normalizeProductName(input)).toBe("Producto");
    },
  );

  it("sanea también el fallback", () => {
    expect(normalizeProductName("<br>", "<p>Taza &amp; termo</p>")).toBe("Taza & termo");
    expect(normalizeProductName("<br>", "<p><br></p>")).toBe("Producto");
  });

  it("es idempotente", () => {
    const dirty = "&lt;p&gt;Agenda&amp;nbsp;A5&lt;/p&gt;";
    const once = normalizeProductName(dirty);
    expect(normalizeProductName(once)).toBe(once);
  });
});

describe("groupLegacyHtmlValues", () => {
  it("agrupa el material limpio y todas sus representaciones heredadas", () => {
    expect(
      groupLegacyHtmlValues(["ABS", "<p>ABS</p>", "&lt;p&gt;ABS&lt;/p&gt;", "Acero"]),
    ).toEqual([
      { label: "ABS", values: ["ABS", "<p>ABS</p>", "&lt;p&gt;ABS&lt;/p&gt;"] },
      { label: "Acero", values: ["Acero"] },
    ]);
  });
});

describe("publicProductName", () => {
  it("prefiere el override, pero nunca publica su HTML", () => {
    expect(publicProductName("<p>Nombre base</p>", "<strong>Nombre admin</strong>")).toBe(
      "Nombre admin",
    );
  });

  it("cae al nombre base si el override está vacío tras sanear", () => {
    expect(publicProductName("<p>Nombre base</p>", "<br>")).toBe("Nombre base");
  });
});
