/**
 * La página de baja servía XSS reflejado hasta el 21-ago-2026.
 *
 * Estos tests ejercitan `unsubscribeMessage` —la función que usa el handler—,
 * no una copia de su interpolación: el primer intento de este test reimplementó
 * el mensaje y se quedó VERDE al mutar el handler. Un test que no comparte
 * código con lo que vigila no vigila nada.
 */
import { describe, it, expect } from "vitest";
import { escapeHtml, unsubscribeMessage } from "./newsletter-unsubscribe-page";

/** El payload exacto que llegó entero a producción. */
const CARGA = "<img src=x onerror=alert(1)>@example.invalid";

describe("página de baja: el email del query string no puede traer markup", () => {
  it("neutraliza el payload que funcionaba en producción", () => {
    const html = unsubscribeMessage({ ok: true, email: CARGA });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("no deja cerrar el <b> para inyectar detrás", () => {
    expect(unsubscribeMessage({ ok: true, email: "a</b><script>alert(1)</script>" })).not.toContain(
      "<script>",
    );
  });

  it("no deja romper un atributo con comillas", () => {
    expect(unsubscribeMessage({ ok: true, email: 'a" onmouseover="alert(1)' })).not.toContain(
      'onmouseover="alert(1)',
    );
  });

  it("también escapa el motivo del camino de error", () => {
    expect(unsubscribeMessage({ ok: false, reason: "<b>ups</b>" })).not.toContain("<b>ups</b>");
  });

  it("un email normal se sigue leyendo igual", () => {
    expect(unsubscribeMessage({ ok: true, email: "ana@empresa.es" })).toContain(
      "<b>ana@empresa.es</b>",
    );
  });

  it("sin email, no monta la etiqueta vacía", () => {
    expect(unsubscribeMessage({ ok: true })).toBe(
      "Tu email ya no recibirá más emails de marketing. Sigues pudiendo pedir cotización con normalidad.",
    );
  });

  it("el mensaje de error mantiene su texto de contacto", () => {
    expect(unsubscribeMessage({ ok: false })).toContain("hola@startidea.es");
  });
});

describe("escapeHtml", () => {
  it("cubre los cuatro caracteres que rompen HTML y atributos", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });
});
