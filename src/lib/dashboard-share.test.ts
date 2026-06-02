import { describe, it, expect, beforeAll } from "vitest";
import { signShareToken, verifyShareToken } from "./dashboard-share";

// Fijar secret antes de cargar el módulo no es posible aquí porque ya está
// importado — pero como el módulo cachea SECRET en module-load, lo fijamos
// en setup.
beforeAll(() => {
  process.env.DASHBOARD_SHARE_SECRET = "test-secret-for-vitest-do-not-deploy";
});

describe("signShareToken + verifyShareToken", () => {
  it("round-trip summary scope con 30 días default", () => {
    const tok = signShareToken("summary");
    const result = verifyShareToken(tok);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.scope).toBe("summary");
      // expiry debe ser ~30 días en el futuro
      const expectedExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      expect(Math.abs(result.expiry - expectedExpiry)).toBeLessThan(5); // 5s tolerance
    }
  });

  it("round-trip full scope con 1 día", () => {
    const tok = signShareToken("full", 1);
    const result = verifyShareToken(tok);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.scope).toBe("full");
  });

  it("rechaza token mal formado (sin 3 partes)", () => {
    expect(verifyShareToken("abc.def")).toMatchObject({
      valid: false,
      reason: "malformed",
    });
    expect(verifyShareToken("solo-una-parte")).toMatchObject({
      valid: false,
      reason: "malformed",
    });
  });

  it("rechaza scope inválido", () => {
    const result = verifyShareToken("invalid.99999999999.sig");
    expect(result).toMatchObject({ valid: false, reason: "bad-scope" });
  });

  it("rechaza expiry no numérico", () => {
    const result = verifyShareToken("summary.NaN.somesig");
    expect(result).toMatchObject({ valid: false, reason: "bad-expiry" });
  });

  it("rechaza token expirado", () => {
    // expiry en el pasado (timestamp en segundos)
    const pastExpiry = Math.floor(Date.now() / 1000) - 100;
    // construir token con firma válida del payload del pasado
    const tok = signShareToken("summary", -1); // negativo → expiry pasado
    void pastExpiry; // intencionalmente no usado, signShareToken usa expiresInDays
    const result = verifyShareToken(tok);
    expect(result).toMatchObject({ valid: false, reason: "expired" });
  });

  it("rechaza firma alterada (1 carácter cambiado)", () => {
    const tok = signShareToken("summary");
    // cambiar el último carácter de la firma
    const parts = tok.split(".");
    const tampered = parts[2].slice(0, -1) + (parts[2].slice(-1) === "A" ? "B" : "A");
    const result = verifyShareToken(`${parts[0]}.${parts[1]}.${tampered}`);
    expect(result).toMatchObject({ valid: false, reason: "bad-signature" });
  });

  it("rechaza firma de longitud distinta (no segfault timingSafeEqual)", () => {
    const tok = signShareToken("summary");
    const parts = tok.split(".");
    const tampered = parts[2] + "extra-bytes";
    const result = verifyShareToken(`${parts[0]}.${parts[1]}.${tampered}`);
    expect(result).toMatchObject({ valid: false, reason: "bad-signature" });
  });

  it("rechaza payload cambiado pero firma del original", () => {
    // Esto simula que alguien intenta cambiar el scope a "full" sin re-firmar
    const tok = signShareToken("summary");
    const parts = tok.split(".");
    const result = verifyShareToken(`full.${parts[1]}.${parts[2]}`);
    expect(result).toMatchObject({ valid: false, reason: "bad-signature" });
  });

  it("tokens consecutivos con misma scope/duración tienen firma distinta sólo si expiry difiere", () => {
    const a = signShareToken("summary", 30);
    const b = signShareToken("summary", 30);
    // Pueden ser idénticos si caen en el mismo segundo
    const [, expiryA] = a.split(".");
    const [, expiryB] = b.split(".");
    if (expiryA === expiryB) {
      expect(a).toBe(b); // mismo input → mismo output (función determinística)
    } else {
      expect(a).not.toBe(b);
    }
  });
});
