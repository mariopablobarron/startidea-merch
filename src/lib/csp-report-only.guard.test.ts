import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * La CSP se estrena en **Report-Only**, y este guard existe para que ese
 * "de momento" no se convierta en "para siempre" ni salte a bloqueo por
 * accidente.
 *
 * Dos riesgos opuestos, uno en cada dirección:
 *  1. Que alguien cambie la clave a `Content-Security-Policy` a secas sin
 *     haber mirado los informes: eso bloquea de verdad, y el primer sitio
 *     donde se nota es el checkout de Stripe o el widget de voz.
 *  2. Que la política se vaya vaciando a base de comodines hasta no decir
 *     nada — `default-src *` pasa cualquier auditoría de "¿tiene CSP?" y no
 *     protege de nada.
 */

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/** El valor de la política, tal como se ensambla en el config. */
function politica(fuente: string): string {
  const m = fuente.match(/const CSP_REPORT_ONLY = \[([\s\S]*?)\]\.join/);
  return m ? m[1] : "";
}

/**
 * Los orígenes de UNA directiva concreta. `politica()` devuelve el bloque
 * entero, y un `toContain` sobre él no distingue en qué directiva está cada
 * host — que es justo lo que hay que vigilar en el tramo que cobra.
 */
function directiva(fuente: string, nombre: string): string {
  const m = politica(fuente).match(new RegExp(`"${nombre} ([^"]*)"`));
  return m ? m[1] : "";
}

describe("CSP: se estrena en Report-Only y no se vacía", () => {
  it("la cabecera es Report-Only, no la de bloqueo", () => {
    expect(CONFIG).toContain('key: "Content-Security-Policy-Report-Only"');
    // Pasar a bloqueo es una decisión, no un renombrado: cuando llegue el día,
    // este test se cambia a propósito y con los informes delante.
    expect(CONFIG).not.toMatch(/key:\s*"Content-Security-Policy"/);
  });

  it("mantiene las directivas que hacen el trabajo de verdad", () => {
    const p = politica(CONFIG);
    // `object-src 'none'` y `base-uri 'self'` son las dos que cierran las vías
    // clásicas de inyección aunque el resto sea permisivo.
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("base-uri 'self'");
    expect(p).toContain("frame-ancestors 'self'");
    expect(p).toContain("form-action 'self'");
    expect(p).toMatch(/default-src 'self'/);
  });

  it("no hay comodines que la dejen en decorado", () => {
    const p = politica(CONFIG);
    // `https:` a secas se acepta SOLO en img-src (el catálogo trae imágenes de
    // varios CDNs a través del proxy). En script-src o default-src sería
    // equivalente a no tener política.
    for (const linea of p.split("\n")) {
      if (linea.includes("img-src")) continue;
      expect(linea).not.toMatch(/(default|script|connect|frame)-src[^"]*\s\*/);
      expect(linea).not.toMatch(/script-src[^"]*'unsafe-eval'/);
    }
  });

  it("cubre los orígenes que la app usa de verdad", () => {
    const p = politica(CONFIG);
    // Si alguien añade un tercero nuevo y no lo pone aquí, lo verá en los
    // informes; estos son los que ya se sabe que están en el código.
    expect(p).toContain("js.stripe.com"); // ExpressCheckoutPay
    expect(p).toContain("api.elevenlabs.io"); // widget de voz
    expect(p).toContain("analytics.hubstartidea.es"); // Umami
    expect(p).toContain("googletagmanager.com"); // GA4 / Google Ads
  });

  it("cada origen de Stripe está en la directiva que le toca", () => {
    // MEDIDO el 29-ago-2026, no supuesto: se cargó Stripe.js y se montaron
    // ExpressCheckoutElement y PaymentElement bajo esta misma política pero
    // EN BLOQUEO. Cero violaciones. Los seis iframes que Stripe levanta
    // (controller, m-outer, hcaptcha-invisible, universal-link-modal y los
    // accessory-target) salen TODOS de js.stripe.com: por eso el host hace
    // falta en `frame-src` y no basta con tenerlo en `script-src`.
    //
    // El `toContain` de arriba mira la política entera y no distingue la
    // directiva: quitar js.stripe.com de frame-src dejaba este guard verde
    // y el Express Checkout roto el día que se pasara a bloqueo. Los wallets
    // (Apple Pay / Google Pay / Link) viven dentro de esos iframes.
    expect(directiva(CONFIG, "script-src")).toContain("https://js.stripe.com");
    expect(directiva(CONFIG, "frame-src")).toContain("https://js.stripe.com");
    // hooks.stripe.com es el iframe del desafío 3DS, en mitad del cobro.
    expect(directiva(CONFIG, "frame-src")).toContain("https://hooks.stripe.com");
    expect(directiva(CONFIG, "connect-src")).toContain("https://api.stripe.com");
  });

  it("la sonda mide exactamente la política que sirve el sitio", () => {
    // `scripts/csp-sonda.html` monta el widget de Stripe con esta política EN
    // BLOQUEO para descubrir qué se rompería. Vale exactamente lo que valga su
    // copia de la política: si alguien añade aquí un origen y no allí, la sonda
    // seguiría dando "cero violaciones" midiendo una política que ya no existe
    // — una herramienta de vigilancia caducada en silencio, que es peor que no
    // tenerla. Dos ausencias son legítimas y están explicadas en la sonda:
    // `report-*` (no hay a dónde informar) y `frame-ancestors` (el navegador la
    // ignora cuando llega por <meta>).
    const sonda = readFileSync(
      join(process.cwd(), "scripts", "csp-sonda.html"),
      "utf8",
    );
    const enLaSonda =
      sonda.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ??
      "";
    expect(enLaSonda).not.toBe("");

    const declaradas = politica(CONFIG)
      .match(/"([^"]+)"/g)!
      .map((d) => d.slice(1, -1))
      .filter(
        (d) => !d.startsWith("report-") && !d.startsWith("frame-ancestors"),
      );
    const medidas = enLaSonda.split(";").map((d) => d.trim());
    for (const d of declaradas) expect(medidas).toContain(d);
  });

  it("GA4 puede llegar a su recolector regional, no solo a www", () => {
    // MEDIDO el 29-ago-2026 con el gtag real (G-FHC95RN6FS): los eventos van
    // a `region1.google-analytics.com/g/collect`, nunca a `www`. Con
    // `www.google-analytics.com` a secas, pasar a bloqueo dejaría a Mario sin
    // medición ninguna y sin nada roto a la vista que lo delatara.
    expect(directiva(CONFIG, "connect-src")).toContain(
      "https://*.google-analytics.com",
    );
  });
});
