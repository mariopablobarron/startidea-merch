import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./JsonLd";

describe("serializeJsonLd", () => {
  it("impide cerrar el script desde datos editoriales sin alterar el JSON", () => {
    const attack = '</script><script>globalThis.pwned=true</script>';
    const serialized = serializeJsonLd({ answer: attack });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual({ answer: attack });
  });

  it("escapa separadores Unicode problemáticos para parsers JavaScript", () => {
    const serialized = serializeJsonLd({ value: "uno\u2028dos\u2029tres" });

    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(JSON.parse(serialized)).toEqual({ value: "uno\u2028dos\u2029tres" });
  });
});
