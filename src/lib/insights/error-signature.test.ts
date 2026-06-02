import { describe, it, expect } from "vitest";
import { messageSignature } from "./error-signature";

describe("messageSignature", () => {
  it("normaliza dígitos consecutivos a N", () => {
    expect(messageSignature("Cannot find user 12345 in DB")).toBe(
      "Cannot find user N in DB",
    );
    expect(messageSignature("Error code 404 on path /admin/orders/9876")).toBe(
      "Error code N on path /admin/orders/N",
    );
  });

  it("normaliza hex addresses a <hex>", () => {
    expect(messageSignature("Failed at 0xDEADBEEF and 0x1234abcd")).toBe(
      "Failed at <hex> and <hex>",
    );
  });

  it("elimina comillas dobles, simples y backticks", () => {
    expect(messageSignature('User "alice" not found')).toBe(
      "User alice not found",
    );
    expect(messageSignature("Token 'abc' inválido")).toBe(
      "Token abc inválido",
    );
    expect(messageSignature("`undefined` is not a function")).toBe(
      "undefined is not a function",
    );
  });

  it("trunca a 120 chars", () => {
    const longMsg = "x".repeat(200);
    const sig = messageSignature(longMsg);
    expect(sig.length).toBe(120);
  });

  it("dos errores del mismo bug con IDs distintos comparten firma", () => {
    const a = messageSignature("Cannot insert product 487 — duplicate key");
    const b = messageSignature("Cannot insert product 12309 — duplicate key");
    expect(a).toBe(b);
    expect(a).toBe("Cannot insert product N — duplicate key");
  });

  it("error completamente vacío no rompe", () => {
    expect(messageSignature("")).toBe("");
  });

  it("hex con solo dígitos también colapsa a <hex>", () => {
    // Tras el fix de orden (hex regex corre antes que dígitos), 0x123
    // matchea el patrón hex y se normaliza igual que 0xDEADBEEF.
    expect(messageSignature("Address: 0x123")).toBe("Address: <hex>");
    expect(messageSignature("Address: 0x9876")).toBe("Address: <hex>");
  });

  it("hex con letras minúsculas y mayúsculas → <hex> (case-insensitive)", () => {
    expect(messageSignature("0xabcdef")).toBe("<hex>");
    expect(messageSignature("0xABCDEF")).toBe("<hex>");
  });

  it("número aislado (sin prefijo 0x) → N", () => {
    // Regression test: asegura que el cambio de orden no rompe la
    // normalización básica de dígitos no-hex.
    expect(messageSignature("Retry 5 of 10")).toBe("Retry N of N");
  });
});
