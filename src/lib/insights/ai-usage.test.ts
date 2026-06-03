import { describe, it, expect } from "vitest";
import { estimateCostEur, PRICING_USD_PER_M, USD_TO_EUR } from "./ai-usage";

describe("estimateCostEur", () => {
  it("modelo desconocido → 0", () => {
    expect(estimateCostEur("foo/bar-xyz", 1000, 500)).toBe(0);
    expect(estimateCostEur(null, 1000, 500)).toBe(0);
  });

  it("Opus 4.7: 1M input + 0 output ≈ 15 USD × 0.93", () => {
    const cost = estimateCostEur("anthropic/claude-opus-4.7", 1_000_000, 0);
    expect(cost).toBeCloseTo(15 * USD_TO_EUR, 2);
  });

  it("Opus 4.7: 0 input + 1M output ≈ 75 USD × 0.93", () => {
    const cost = estimateCostEur("anthropic/claude-opus-4.7", 0, 1_000_000);
    expect(cost).toBeCloseTo(75 * USD_TO_EUR, 2);
  });

  it("Sonnet 4.5 más barato que Opus 4.7", () => {
    const opus = estimateCostEur(
      "anthropic/claude-opus-4.7",
      100_000,
      10_000,
    );
    const sonnet = estimateCostEur(
      "anthropic/claude-sonnet-4.5",
      100_000,
      10_000,
    );
    expect(sonnet).toBeLessThan(opus);
  });

  it("Haiku 4.5 más barato que Sonnet 4.5", () => {
    const haiku = estimateCostEur(
      "anthropic/claude-haiku-4.5",
      100_000,
      10_000,
    );
    const sonnet = estimateCostEur(
      "anthropic/claude-sonnet-4.5",
      100_000,
      10_000,
    );
    expect(haiku).toBeLessThan(sonnet);
  });

  it("0 tokens → 0 EUR", () => {
    expect(estimateCostEur("anthropic/claude-opus-4.7", 0, 0)).toBe(0);
  });

  it("PRICING_USD_PER_M tiene los modelos más usados", () => {
    expect(PRICING_USD_PER_M["anthropic/claude-opus-4.7"]).toBeDefined();
    expect(PRICING_USD_PER_M["anthropic/claude-sonnet-4.5"]).toBeDefined();
    expect(PRICING_USD_PER_M["anthropic/claude-haiku-4.5"]).toBeDefined();
  });
});
