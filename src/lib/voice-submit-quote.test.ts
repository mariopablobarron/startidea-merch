import { describe, it, expect } from "vitest";
import { SubmitQuoteSchema, MAX_SLUG_CHARS, SUBMIT_QUOTE_RATE_LIMIT } from "./voice-submit-quote";

const item = { product_slug: "taza-ceramica-blanca", quantity: 100 };
const base = { name: "Ana López", email: "ana@empresa.es", items: [item] };

describe("SubmitQuoteSchema", () => {
  it("acepta lo que manda Carmen tras confirmar la cotización", () => {
    const r = SubmitQuoteSchema.safeParse({
      ...base,
      company: "Empresa SL",
      phone: "600111222",
      items: [
        { ...item, markings: [{ position_id: "pecho", technique_code: "SER", number_of_colors: 2 }] },
      ],
      notes: "Entrega antes de la feria",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un product_slug por encima del tope", () => {
    const largo = "s".repeat(MAX_SLUG_CHARS + 1);
    expect(
      SubmitQuoteSchema.safeParse({ ...base, items: [{ ...item, product_slug: largo }] }).success,
    ).toBe(false);
  });

  it("acepta el slug más largo del catálogo real (80 caracteres)", () => {
    expect(
      SubmitQuoteSchema.safeParse({
        ...base,
        items: [{ ...item, product_slug: "s".repeat(80) }],
      }).success,
    ).toBe(true);
  });

  it("un slug desmedido no se cuela acompañado de items válidos", () => {
    expect(
      SubmitQuoteSchema.safeParse({
        ...base,
        items: [item, { ...item, product_slug: "s".repeat(5000) }],
      }).success,
    ).toBe(false);
  });

  it("sigue exigiendo al menos un item y capando a 20", () => {
    expect(SubmitQuoteSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(
      SubmitQuoteSchema.safeParse({ ...base, items: Array.from({ length: 21 }, () => item) })
        .success,
    ).toBe(false);
  });

  it("mantiene los topes de los datos de contacto que se persisten", () => {
    expect(SubmitQuoteSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
    expect(SubmitQuoteSchema.safeParse({ ...base, email: "no-es-un-email" }).success).toBe(false);
    expect(
      SubmitQuoteSchema.safeParse({ ...base, email: `${"a".repeat(160)}@b.es` }).success,
    ).toBe(false);
    expect(SubmitQuoteSchema.safeParse({ ...base, notes: "n".repeat(2001) }).success).toBe(false);
  });

  it("el cupo es el mismo que el de request-callback: 20 por 10 minutos", () => {
    expect(SUBMIT_QUOTE_RATE_LIMIT.max).toBe(20);
    expect(SUBMIT_QUOTE_RATE_LIMIT.windowMs).toBe(10 * 60_000);
    expect(SUBMIT_QUOTE_RATE_LIMIT.key).toBe("voice-submit-quote");
  });
});

// Guard: el test de arriba fija la constante, pero solo esto comprueba que el
// handler la USA — y antes de parsear. (La lección de fc5cdb4: un test que no
// comparte código con lo que vigila no vigila nada.)
describe("submit-quote route", () => {
  it("aplica el rate limit antes de validar el payload", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/api/voice-agent/tools/submit-quote/route.ts", "utf8");
    expect(src).toContain("rateLimit(req, SUBMIT_QUOTE_RATE_LIMIT)");
    expect(src.indexOf("rateLimit(req,")).toBeLessThan(src.indexOf("SubmitQuoteSchema.safeParse"));
  });
});
