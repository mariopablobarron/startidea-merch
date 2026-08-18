import { describe, it, expect } from "vitest";
import { escapeTgHtml } from "./telegram";

// La primitiva existía desde hace tiempo y NO tenía un solo test, aunque su
// propio comentario describe el fallo que evita: Telegram envía con
// parse_mode=HTML, así que un `<`, `>` o `&` sin escapar hace que la API
// devuelva 400 y el aviso se pierda EN SILENCIO (el llamador hace
// `void notifyTelegram(...).catch(console.error)`: nadie mira el resultado).
describe("escapeTgHtml — un nombre con & no puede tumbar el aviso", () => {
  it("escapa los tres caracteres que rompen el HTML de Telegram", () => {
    expect(escapeTgHtml("Fernández & Cía")).toBe("Fernández &amp; Cía");
    expect(escapeTgHtml("<b>ojo</b>")).toBe("&lt;b&gt;ojo&lt;/b&gt;");
  });

  it("escapa el & ANTES que < y >, o se produciría doble escape", () => {
    // Si el orden fuera el inverso, "<" → "&lt;" y luego ese "&" volvería a
    // escaparse a "&amp;lt;", y el mensaje mostraría literalmente "&lt;".
    expect(escapeTgHtml("<")).toBe("&lt;");
    expect(escapeTgHtml("&lt;")).toBe("&amp;lt;");
  });

  it("escapa TODAS las apariciones, no solo la primera", () => {
    expect(escapeTgHtml("A & B & C")).toBe("A &amp; B &amp; C");
    expect(escapeTgHtml("<<>>")).toBe("&lt;&lt;&gt;&gt;");
  });

  it("null y undefined dan cadena vacía, no 'null' impreso en el aviso", () => {
    expect(escapeTgHtml(null)).toBe("");
    expect(escapeTgHtml(undefined)).toBe("");
  });

  it("deja intacto lo que no tiene nada que escapar", () => {
    expect(escapeTgHtml("Propuesta PROP-2026-0007 · 1.234,56€")).toBe(
      "Propuesta PROP-2026-0007 · 1.234,56€",
    );
  });

  it("no toca las comillas: Telegram no las interpreta fuera de atributos", () => {
    expect(escapeTgHtml('Empresa "La Única"')).toBe('Empresa "La Única"');
  });
});
