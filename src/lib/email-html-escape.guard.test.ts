/**
 * Guard: el HTML de email que construyen las rutas PÚBLICAS no puede
 * interpolar datos del usuario sin escapar.
 *
 * Por qué existe: `/api/cart-quote` y `/api/mockup-request` son públicas —sin
 * sesión ni secreto, sólo rate limit— y el email que producen **va al buzón
 * interno del equipo**. Quien rellena el formulario controla `name`, `company`,
 * `phone`, `message`... y esos valores iban crudos dentro del HTML; el teléfono
 * iba además DENTRO de un atributo (`href="tel:${...}"`), donde una comilla
 * rompe el atributo y mete markup arbitrario en el correo que abre el equipo.
 *
 * No es XSS de navegador (los clientes de correo no ejecutan scripts): es
 * markup inyectado en el buzón interno, que sirve para suplantar un enlace y
 * hacer phishing dirigido a quien atiende los pedidos.
 *
 * La ruta hermana `/api/cart-quote/save-for-later` ya escapaba bien desde
 * siempre. Es el mismo patrón que el schema duplicado del carrito: dos puertas
 * al mismo dato y sólo una cerrada.
 *
 * Estos patrones son LITERALES a propósito: vigilan la regresión concreta
 * (volver a pegar la interpolación cruda), no una idea abstracta. Y el propio
 * regex se comprueba contra una cadena de control, porque un guard que no
 * encuentra lo que busca pasa en verde sin vigilar nada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");

/** Interpolaciones crudas que NO pueden volver al HTML de estas rutas. */
const PROHIBIDOS: Record<string, string[]> = {
  "src/app/api/cart-quote/route.ts": [
    "${cart.name}",
    "${cart.company}",
    "${cart.phone}",
    "${cart.deadline}",
    "${it.productName}",
    "${it.productRef}",
    'href="tel:${cart.phone}"',
    '${cart.message.replace(/\\n/g, "<br>")}',
  ],
  "src/app/api/mockup-request/route.ts": [
    "${data.name}<",
    "${data.company}<",
    "<td>${data.email}</td>",
    "<td>${data.phone}</td>",
    "<td>${productName}</td>",
    'href="${data.sourceUrl}"',
  ],
  "src/app/api/quote-request-product/route.ts": ["<p>Hola${d.name ? ` ${d.name}` : \"\"},</p>"],
  "src/app/api/calculadora-rsc/route.ts": ["Hola ${firstName}.<br>"],
  "src/app/api/partners/apply/route.ts": ["Hola ${firstName}.<br>"],
};

function fuente(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf8");
}

describe("guard: HTML de email sin interpolaciones crudas", () => {
  for (const [rel, patrones] of Object.entries(PROHIBIDOS)) {
    it(`${rel} no interpola datos de usuario sin escapar`, () => {
      const src = fuente(rel);
      for (const p of patrones) {
        expect(src.includes(p), `reapareció la interpolación cruda ${p}`).toBe(false);
      }
    });
  }

  it("los ficheros vigilados existen y usan escapeHtml (si no, el guard vigilaría el vacío)", () => {
    for (const rel of Object.keys(PROHIBIDOS)) {
      const src = fuente(rel);
      expect(src.length, `${rel} vacío o ilegible`).toBeGreaterThan(500);
      expect(src.includes("escapeHtml("), `${rel} ya no usa escapeHtml`).toBe(true);
    }
  });

  it("la comprobación sabe encontrar el patrón cuando SÍ está (anti-falso-verde)", () => {
    const control = 'html: `<h1>${cart.name}</h1><a href="tel:${cart.phone}">x</a>`';
    expect(control.includes("${cart.name}")).toBe(true);
    expect(control.includes('href="tel:${cart.phone}"')).toBe(true);
  });
});
