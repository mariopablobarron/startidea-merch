import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard POR DESCUBRIMIENTO: ningún fichero de `src/` puede llamar a un host de
 * tracking de terceros sin pasar por `@/lib/consent`.
 *
 * No es una lista blanca de los pixels que hay hoy — eso solo probaría que no
 * vuelven los viejos. Recorre el árbol entero, así que el pixel que alguien
 * añada el mes que viene en un componente nuevo también cae aquí.
 *
 * Nació de esto: Meta y LinkedIn se cargaban en cada visita sin preguntar
 * nada, y el comentario del fichero afirmaba que respetaban el Consent Mode
 * de Google. Lo respetaba gtag; `fbq` y `lintrk` ni lo miran.
 */

const RAIZ = join(process.cwd(), "src");
const ESTE_FICHERO = "pixels-solo-con-consentimiento.guard.test.ts";

/** Hosts que, al cargarse, informan a un tercero de que hay una visita. */
const HOSTS_DE_TRACKING = [
  "connect.facebook.net",
  "facebook.com/tr",
  "snap.licdn.com",
  "px.ads.linkedin.com",
  "googletagmanager.com",
  "pixel.byspotify.com",
  "google-analytics.com",
];

/** `dns-prefetch` y `preconnect` solo calientan DNS/TLS: no envían visita. */
const PISTAS_DE_HINT = ["dns-prefetch", "preconnect", "prefetch"];

const IMPORTA_EL_GATE = /from\s+["']@\/lib\/consent["']/;

/**
 * Única excepción, y no es gratuita: GA4 se gobierna con el Consent Mode v2 de
 * Google — carga con todo en `denied` y no mide hasta el `update` que emite el
 * banner. Es el mecanismo que Google prescribe y no lo tienen `fbq` ni
 * `lintrk`, que por eso sí necesitan el gate. La exención va acompañada del
 * test de abajo, que comprueba que ese `default: denied` sigue ahí: si alguien
 * lo quita, el fichero se queda sin defensa y el guard lo dice.
 */
const EXENTO_POR_CONSENT_MODE = "src/components/GoogleAnalytics.tsx";

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosDeCodigo(ruta));
    } else if (/\.(ts|tsx)$/.test(entrada) && entrada !== ESTE_FICHERO) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * El detector, aislado del sistema de ficheros para poder probarlo con
 * fuentes sintéticas: un guard cuyo comparador esté roto pasa verde sobre
 * cualquier código, y entonces no vigila nada.
 */
function lineasQueCarganSinConsentimiento(fuente: string): string[] {
  if (IMPORTA_EL_GATE.test(fuente)) return [];
  return fuente
    .split("\n")
    .filter(
      (linea) =>
        HOSTS_DE_TRACKING.some((host) => linea.includes(host)) &&
        !PISTAS_DE_HINT.some((pista) => linea.includes(pista)),
    )
    .map((linea) => linea.trim());
}

describe("los pixels de terceros solo cargan con consentimiento", () => {
  const ficheros = ficherosDeCodigo(RAIZ);

  it("ningún fichero llama a un host de tracking sin importar el gate", () => {
    const culpables = ficheros
      .map((ruta) => ({
        ruta: ruta.replace(process.cwd() + "/", ""),
        lineas: lineasQueCarganSinConsentimiento(readFileSync(ruta, "utf8")),
      }))
      .filter((f) => f.lineas.length > 0 && f.ruta !== EXENTO_POR_CONSENT_MODE);

    expect(culpables).toEqual([]);
  });

  it("no queda ningún <noscript> de tracking: sin JS no se puede preguntar", () => {
    const conNoscript = ficheros.filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      if (!fuente.includes("<noscript>")) return false;
      const bloques = fuente.split("<noscript>").slice(1);
      return bloques.some((bloque) => {
        const hasta = bloque.split("</noscript>")[0];
        return HOSTS_DE_TRACKING.some((host) => hasta.includes(host));
      });
    });

    expect(conNoscript.map((r) => r.replace(process.cwd() + "/", ""))).toEqual([]);
  });

  it("el exento mantiene el Consent Mode que justifica su exención", () => {
    const fuente = readFileSync(join(process.cwd(), EXENTO_POR_CONSENT_MODE), "utf8");
    const posicionDefault = fuente.indexOf("'consent', 'default'");
    const posicionConfig = fuente.indexOf("'config'");

    expect(posicionDefault).toBeGreaterThan(-1);
    expect(fuente).toMatch(/analytics_storage:\s*'denied'/);
    expect(fuente).toMatch(/ad_storage:\s*'denied'/);
    // El orden importa: declarar el denegado DESPUÉS de configurar la medición
    // deja pasar los primeros eventos.
    expect(posicionDefault).toBeLessThan(posicionConfig);
  });

  // — El guard se vigila a sí mismo —

  it("de verdad está mirando el árbol y la lista no se ha quedado corta", () => {
    expect(ficheros.length).toBeGreaterThan(200);
    expect(HOSTS_DE_TRACKING.length).toBeGreaterThanOrEqual(6);

    const mencionan = ficheros.filter((ruta) =>
      HOSTS_DE_TRACKING.some((host) => readFileSync(ruta, "utf8").includes(host)),
    );
    // Si esto cae a cero, el guard estaría pasando verde sobre un árbol que
    // no reconoce (ruta mal, extensiones mal) en vez de sobre uno limpio.
    expect(mencionan.length).toBeGreaterThanOrEqual(3);
  });

  it("el detector marca el código sin gate y absuelve el que lo tiene", () => {
    const sinGate = `import Script from "next/script";
      <Script src="https://connect.facebook.net/en_US/fbevents.js" />`;
    expect(lineasQueCarganSinConsentimiento(sinGate)).toHaveLength(1);

    const conGate = `import { hasMarketingConsent } from "@/lib/consent";
      <Script src="https://connect.facebook.net/en_US/fbevents.js" />`;
    expect(lineasQueCarganSinConsentimiento(conGate)).toHaveLength(0);

    const soloHint = `<link rel="dns-prefetch" href="https://connect.facebook.net" />`;
    expect(lineasQueCarganSinConsentimiento(soloHint)).toHaveLength(0);
  });
});
