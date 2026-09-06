import { describe, it, expect } from "vitest";
import { formatearNumero } from "./presupuesto-numero";

describe("formatearNumero", () => {
  it("es PRE-AAAA-NNNN con cuatro dígitos", () => {
    expect(formatearNumero(2026, 1)).toBe("PRE-2026-0001");
    expect(formatearNumero(2026, 42)).toBe("PRE-2026-0042");
    expect(formatearNumero(2026, 1234)).toBe("PRE-2026-1234");
  });

  it("pasado el 9999 no trunca el número, lo alarga", () => {
    // Perder un dígito daría dos presupuestos con el mismo número.
    expect(formatearNumero(2026, 10001)).toBe("PRE-2026-10001");
  });
});
