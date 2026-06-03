import { describe, it, expect } from "vitest";
import { extractJsonFromAIResponse } from "./json-extract";

describe("extractJsonFromAIResponse", () => {
  it("JSON puro pasa tal cual (con trim)", () => {
    const json = '{"items":[{"slug":"abc","quantity":10}]}';
    expect(extractJsonFromAIResponse(json)).toBe(json);
    expect(extractJsonFromAIResponse(`  ${json}  `)).toBe(json);
  });

  it("markdown ```json wrapper se quita", () => {
    const input = '```json\n{"items":[{"slug":"abc"}]}\n```';
    const result = extractJsonFromAIResponse(input);
    expect(JSON.parse(result)).toEqual({ items: [{ slug: "abc" }] });
  });

  it("markdown ``` (sin lang) wrapper se quita", () => {
    const input = '```\n{"foo":"bar"}\n```';
    expect(JSON.parse(extractJsonFromAIResponse(input))).toEqual({ foo: "bar" });
  });

  it("texto explicativo antes del JSON → extrae primer {...}", () => {
    const input =
      "Aquí está la propuesta:\n\n" +
      '{"items":[{"slug":"polo-corte","quantity":40}],"summary":"3 productos"}';
    const result = extractJsonFromAIResponse(input);
    expect(JSON.parse(result)).toEqual({
      items: [{ slug: "polo-corte", quantity: 40 }],
      summary: "3 productos",
    });
  });

  it("texto explicativo antes y después → extrae el JSON del medio", () => {
    const input =
      "Pensé en estos productos:\n" +
      '{"items":[{"slug":"toalla","quantity":100}]}' +
      "\n\n¡Espero que te ayude!";
    expect(JSON.parse(extractJsonFromAIResponse(input))).toEqual({
      items: [{ slug: "toalla", quantity: 100 }],
    });
  });

  it("array top-level también funciona", () => {
    const input = "Aquí va:\n[{\"a\":1},{\"b\":2}]";
    expect(JSON.parse(extractJsonFromAIResponse(input))).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it("string vacío devuelve string vacío", () => {
    expect(extractJsonFromAIResponse("")).toBe("");
  });

  it("texto sin JSON devuelve el original trimmed (para que JSON.parse falle legible)", () => {
    const input = "  no hay nada parseable aquí  ";
    expect(extractJsonFromAIResponse(input)).toBe("no hay nada parseable aquí");
  });

  it("markdown con json en mayúsculas (```JSON)", () => {
    const input = '```JSON\n{"x":1}\n```';
    expect(JSON.parse(extractJsonFromAIResponse(input))).toEqual({ x: 1 });
  });

  it("JSON con saltos de línea y espacios dentro pasa tal cual", () => {
    const json = '{\n  "items": [\n    {"slug": "a"}\n  ]\n}';
    expect(extractJsonFromAIResponse(json)).toBe(json.trim());
  });

  it("caso real Claude con prefijo y wrapper", () => {
    const input =
      "Voy a recomendar productos que encajan con el brief.\n\n" +
      "```json\n" +
      '{"items":[{"slug":"toalla-microfibra","quantity":100,"rationale":"Encaja con brief"}],"summary":"Pack toallas + polos","internalAdvice":"Considera upsell con embalaje premium"}\n' +
      "```";
    const result = extractJsonFromAIResponse(input);
    const parsed = JSON.parse(result);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.summary).toBe("Pack toallas + polos");
  });
});
