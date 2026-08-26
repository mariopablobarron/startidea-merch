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
  // Umami. Vive en un dominio NUESTRO (analytics.hubstartidea.es) y por eso
  // no encajaba en la idea de «tercero» con la que se escribió esta lista:
  // se coló y estuvo midiendo a todo visitante sin pasar por el banner,
  // mientras el banner lo ofrecía como una casilla desmarcable. Que el
  // servidor sea propio no cambia lo que el usuario cree haber decidido.
  "analytics.hubstartidea.es",
];

/**
 * Hints de red que NO envían la visita a nadie.
 *
 * ⚠️ `preconnect` estaba en esta lista y no debía: `dns-prefetch` resuelve un
 * nombre y ahí acaba, pero `preconnect` **abre el handshake TCP/TLS**, así que
 * el servidor de destino ve la IP del visitante aunque el script nunca llegue
 * a cargarse. Con Umami eso significaba enseñarle cada visita al servidor de
 * analítica justo cuando se estaba gateando el script para no hacerlo. Va
 * aparte, en `HINTS_QUE_CONTACTAN`.
 */
const PISTAS_DE_HINT = ["dns-prefetch", "prefetch"];

/** Hints que sí abren conexión con el destino, y por eso no valen como excusa. */
const HINTS_QUE_CONTACTAN = ["preconnect", "preload"];

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
    } else if (
      /\.(ts|tsx)$/.test(entrada) &&
      entrada !== ESTE_FICHERO &&
      // Los ficheros de test se excluyen del recorrido entero: no entran en
      // el bundle, así que ninguno puede cargar un pixel en el navegador de
      // nadie. Lo que sí hacen es NOMBRAR hosts —`supplier-leak-paridad` pasa
      // un src de cdn1.midocean.com a su detector, y el guard de la CSP cita
      // googletagmanager y Umami para comprobar que la política los cubre— y
      // denunciarlos por mencionarlos empuja a trocear los literales para
      // esquivar el guard, que es peor que no tenerlo.
      !/\.test\.tsx?$/.test(entrada)
    ) {
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

/**
 * Dominios que servimos nosotros y que no miden nada: cargar de ahí no
 * informa a ningún tercero de que existe la visita.
 *
 * `analytics.hubstartidea.es` NO está aquí a propósito, aunque el servidor
 * sea nuestro: es justo el servicio de medición del que hablamos.
 */
const DOMINIOS_PROPIOS_SIN_MEDICION = [
  "merchandising.startidea.es",
  "merchandising.hubstartidea.es",
  "startidea.es",
];

/**
 * Exenciones del test de scripts externos. Cada una necesita su razón aquí:
 *
 *  - `GoogleAnalytics.tsx`: Consent Mode v2 (ver arriba), con su propio test.
 *  - `AdsPixels.tsx`: sí importa el gate; queda por si alguien reordena los
 *    imports y el detector deja de verlo — el otro test lo cubre igual.
 */
const SCRIPTS_EXTERNOS_EXENTOS = [EXENTO_POR_CONSENT_MODE];

/** Hosts de `<Script src="https://…">` en ficheros que no importan el gate. */
function scriptsExternosSinGate(fuente: string): string[] {
  if (IMPORTA_EL_GATE.test(fuente)) return [];
  const hosts: string[] = [];
  for (const m of fuente.matchAll(/src=\{?[`"']https:\/\/([a-z0-9.-]+)/gi)) {
    const host = m[1].toLowerCase();
    if (DOMINIOS_PROPIOS_SIN_MEDICION.includes(host)) continue;
    if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
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

  /**
   * El anterior es una lista de hosts conocidos, y por eso Umami lo esquivó
   * dos meses: no estaba en ella. Este test no pregunta *qué* host es, sino
   * si un `<Script>` sale a un dominio que no es el nuestro — así el que
   * llegue mañana también cae, se llame como se llame.
   */
  it("ningún <Script src> sale a un dominio ajeno sin gate ni exención escrita", () => {
    const culpables = ficheros
      .map((ruta) => ({
        ruta: ruta.replace(process.cwd() + "/", ""),
        hosts: scriptsExternosSinGate(readFileSync(ruta, "utf8")),
      }))
      .filter((f) => f.hosts.length > 0 && !SCRIPTS_EXTERNOS_EXENTOS.includes(f.ruta));

    expect(culpables).toEqual([]);
  });

  it("el detector de scripts externos distingue el gate, el propio dominio y el inline", () => {
    const ajenoSinGate = `<Script src="https://cdn.ajeno.com/x.js" />`;
    expect(scriptsExternosSinGate(ajenoSinGate)).toEqual(["cdn.ajeno.com"]);

    const ajenoConGate = `import { hasAnalyticsConsent } from "@/lib/consent";
      <Script src="https://cdn.ajeno.com/x.js" />`;
    expect(scriptsExternosSinGate(ajenoConGate)).toEqual([]);

    // Un asset servido por nosotros no informa a nadie de la visita.
    const propio = `<Script src="https://merchandising.startidea.es/sw.js" />`;
    expect(scriptsExternosSinGate(propio)).toEqual([]);

    // El caso real que se coló: dominio propio, pero servicio que mide.
    const umami = `<Script src="https://analytics.hubstartidea.es/script.js" />`;
    expect(scriptsExternosSinGate(umami)).toEqual(["analytics.hubstartidea.es"]);

    // Un `<Script>` sin src (JSON-LD, inicializaciones) no sale a la red.
    const inline = `<Script id="algo">{\`console.log(1)\`}</Script>`;
    expect(scriptsExternosSinGate(inline)).toEqual([]);
  });


  it("ningún host de tracking se precalienta con preconnect (solo dns-prefetch)", () => {
    // `preconnect` a un servidor de analítica es una conexión TLS por visita:
    // le llega la IP de quien no ha aceptado nada. Es la mitad del defecto que
    // queda cuando solo se gatea el <Script>.
    const infractores: string[] = [];
    for (const ruta of ficheros) {
      for (const linea of readFileSync(ruta, "utf8").split("\n")) {
        if (!HINTS_QUE_CONTACTAN.some((h) => linea.includes(`"${h}"`))) continue;
        if (!HOSTS_DE_TRACKING.some((host) => linea.includes(host))) continue;
        infractores.push(`${ruta.replace(process.cwd() + "/", "")}: ${linea.trim()}`);
      }
    }
    expect(infractores).toEqual([]);
  });

  it("el detector no confunde dns-prefetch con preconnect", () => {
    const conPreconnect = `<link rel="preconnect" href="https://analytics.hubstartidea.es" />`;
    // Ya no cuenta como hint inocente: sin gate, se denuncia.
    expect(lineasQueCarganSinConsentimiento(conPreconnect)).toHaveLength(1);

    const conDnsPrefetch = `<link rel="dns-prefetch" href="https://analytics.hubstartidea.es" />`;
    expect(lineasQueCarganSinConsentimiento(conDnsPrefetch)).toHaveLength(0);
  });

  // — El guard se vigila a sí mismo —

  it("de verdad está mirando el árbol y la lista no se ha quedado corta", () => {
    expect(ficheros.length).toBeGreaterThan(200);
    // La exclusión de tests es una decisión, no un descuido: si alguien la
    // quita, el guard empezará a denunciar ficheros que solo citan un host.
    expect(ficheros.some((f) => /\.test\.tsx?$/.test(f))).toBe(false);
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
