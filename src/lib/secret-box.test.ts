import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-box";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe("secret-box", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64); // 32 bytes hex de prueba
  });
  afterEach(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("descifra exactamente lo que cifró (roundtrip)", () => {
    const plain = JSON.stringify({ token: "cmpldw94w-secreto-real", base: "https://api.cifrashop.com" });
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("dos cifrados del mismo texto NO son iguales (IV aleatorio)", () => {
    const plain = "mismo-secreto";
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("detecta manipulación del blob (auth tag) — no descifra silenciosamente algo corrupto", () => {
    const blob = encryptSecret("secreto");
    const tampered = blob.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("blob demasiado corto lanza en vez de devolver basura", () => {
    expect(() => decryptSecret("YWJj")).toThrow(/corrupto/);
  });

  it("sin ENCRYPTION_KEY configurada, lanza en vez de cifrar con clave vacía", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("con ENCRYPTION_KEY de longitud incorrecta, lanza", () => {
    process.env.ENCRYPTION_KEY = "demasiado-corta";
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
