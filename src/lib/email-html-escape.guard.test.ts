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
};

/**
 * Falsos positivos revisados a mano. Estos tres estaban en `PROHIBIDOS` y no
 * les corresponde: los tres son el saludo por nombre de pila en un email
 * dirigido **a esa misma persona** (el cliente que pide presupuesto, el que usa
 * la calculadora RSC, el que solicita el programa partners). Quien escribe el
 * nombre es el único que lee ese correo, así que no hay a quién suplantar ni
 * buzón interno donde inyectar nada — es exactamente el caso que el guard
 * hermano por descubrimiento ya declara aceptable para los saludos.
 *
 * Se quedan listados —en vez de simplemente borrados— para que el siguiente
 * barrido no los vuelva a "descubrir" y los escape sin motivo.
 */
const ACEPTADAS: Record<string, string> = {
  "src/app/api/quote-request-product/route.ts":
    "saludo `Hola ${d.name}` en la confirmación al propio solicitante",
  "src/app/api/calculadora-rsc/route.ts":
    "saludo `Hola ${firstName}` en el resultado que se manda a quien lo calculó",
  "src/app/api/partners/apply/route.ts":
    "saludo `Hola ${firstName}` en el acuse al propio solicitante de partner",
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

  it("los falsos positivos aceptados siguen siendo el saludo al propio destinatario", () => {
    // Si alguno deja de ser un saludo (por ejemplo, porque el email pasa a ir
    // al buzón interno), esta comprobación se cae y toca revisar la excepción.
    for (const [rel, motivo] of Object.entries(ACEPTADAS)) {
      const src = fuente(rel);
      expect(src.includes("Hola"), `${rel}: ya no hay saludo — ${motivo}`).toBe(true);
      // Los dos nombres con los que se direcciona hoy el buzón del equipo:
      // `cart-quote` usa RESEND_TO_INTERNAL y `mockup-request` usa
      // NOTIFY_INTERNAL_EMAIL. Mirar sólo el primero dejaría pasar que una de
      // estas rutas empiece a escribir a pedidos@ por la otra variable, que es
      // justo el escenario que invalida la excepción.
      for (const buzon of ["RESEND_TO_INTERNAL", "NOTIFY_INTERNAL_EMAIL"]) {
        expect(src.includes(buzon), `${rel}: ahora escribe al buzón interno (${buzon})`).toBe(
          false,
        );
      }
    }
  });

  it("la comprobación sabe encontrar el patrón cuando SÍ está (anti-falso-verde)", () => {
    const control = 'html: `<h1>${cart.name}</h1><a href="tel:${cart.phone}">x</a>`';
    expect(control.includes("${cart.name}")).toBe(true);
    expect(control.includes('href="tel:${cart.phone}"')).toBe(true);
  });
});
