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
});
