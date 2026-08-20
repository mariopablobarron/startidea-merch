import { describe, it, expect } from "vitest";
import { NewsletterSubscribeSchema, MAX_EMAIL_CHARS } from "./newsletter-subscribe-schema";

/** Alta real desde el footer de la home. */
function altaReal(extra: Record<string, unknown> = {}) {
  return { email: "compras@empresa.es", name: "Ana Ruiz", source: "home-footer", ...extra };
}

describe("NewsletterSubscribeSchema", () => {
  // El tope se fija con un literal A PROPÓSITO: los tests de abajo derivan sus
  // tamaños de la constante, así que subirla a 100.000 los dejaría en verde.
  // Cambiarla obliga a tocar esta línea y a justificarla contra producción.
  it("fija el tope de email en el valor medido", () => {
    expect(MAX_EMAIL_CHARS).toBe(160);
  });

  it("acepta el alta real del footer", () => {
    expect(NewsletterSubscribeSchema.safeParse(altaReal()).success).toBe(true);
  });

  it("acepta el alta mínima (solo email)", () => {
    expect(NewsletterSubscribeSchema.safeParse({ email: "a@b.es" }).success).toBe(true);
  });

  it("rechaza un email por encima del tope aunque sea sintácticamente válido", () => {
    const largo = `${"a".repeat(MAX_EMAIL_CHARS)}@empresa.es`;
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ email: largo })).success).toBe(false);
  });

  it("rechaza un email absurdo (10 KB) sea cual sea la constante", () => {
    const enorme = `${"a".repeat(10_000)}@empresa.es`;
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ email: enorme })).success).toBe(false);
  });

  it("sigue exigiendo que sea un email", () => {
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ email: "no-es-un-email" })).success).toBe(false);
  });

  it("acota los campos libres que se persisten", () => {
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ name: "x".repeat(121) })).success).toBe(false);
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ company: "x".repeat(161) })).success).toBe(false);
    expect(NewsletterSubscribeSchema.safeParse(altaReal({ source: "x".repeat(61) })).success).toBe(false);
  });

  it("no rompe el cupón: 'lead-popup' y 'exit-intent' siguen siendo fuentes válidas", () => {
    // La ruta decide el WELCOME10 por `source`; si el schema lo rechazara, el
    // popup dejaría de entregar el cupón prometido.
    for (const source of ["lead-popup", "exit-intent"]) {
      expect(NewsletterSubscribeSchema.safeParse(altaReal({ source })).success).toBe(true);
    }
  });
});
