import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: todo host desde el que el código carga un script
 * tiene que estar permitido en `script-src`.
 *
 * Nació de un fallo concreto. El guard de consentimiento ya conocía
 * `pixel.byspotify.com` —estaba en su lista de hosts de tracking— y la CSP no
 * lo permitía, pero **nadie cruzaba las dos cosas**: el pixel de Spotify llevaba
 * meses activo en producción y fuera de la política. Salió el 26-ago-2026
 * leyendo los informes de Report-Only en un navegador, no en el código.
 *
 * El test de `csp-report-only.guard.test.ts` que comprueba "los orígenes que la
 * app usa" es una **lista escrita a mano**: solo demuestra que no desaparecen
 * los que ya alguien apuntó. Este recorre el árbol, así que el tercero que
 * entre el mes que viene también cae, se llame como se llame.
 *
 * ⚠️ Lo que este guard NO puede ver, y por eso no sustituye a leer los
 * informes: los hosts que se eligen en tiempo de ejecución. GA4 manda los
 * eventos a un recolector regional (`region1.google-analytics.com` desde
 * España) que no aparece escrito en ningún sitio del repo.
 */

const RAIZ = join(process.cwd(), "src");
const ESTE_FICHERO = "csp-cubre-hosts-de-script.guard.test.ts";
const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/** Dominios que servimos nosotros: los cubre `'self'`. */
const DOMINIOS_PROPIOS = [
  "merchandising.startidea.es",
  "merchandising.hubstartidea.es",
];

/**
 * Un fichero "carga scripts" si monta un `<Script>`, asigna un `.src`, o crea
 * el elemento a mano. Lo tercero importa: `SpotifyPixel.tsx` no usa `<Script>`
 * de Next, hace `document.createElement("script")` — mirar solo el JSX habría
 * dejado fuera justo el caso que originó este guard.
 */
const CARGA_SCRIPTS = /createElement\((["'`]script["'`]|e)\)|<Script|\.src\s*=/;

/** El valor de `script-src`, tal como se ensambla en el config. */
function scriptSrc(fuente: string): string {
  const m = fuente.match(/"script-src ([^"]*)"/);
  return m ? m[1] : "";
}

function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosDeCodigo(ruta));
    } else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      // Los tests no entran en el bundle: ninguno carga un script en el
      // navegador de nadie, y varios NOMBRAN hosts a propósito.
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Hosts https de un fichero que carga scripts. Aislado del sistema de ficheros
 * para poder probarlo con fuentes sintéticas: un guard con el comparador roto
 * pasa verde sobre cualquier código, y entonces no vigila nada.
 */
export function hostsDeScript(fuente: string): string[] {
  if (!CARGA_SCRIPTS.test(fuente)) return [];
  const hosts: string[] = [];
  for (const m of fuente.matchAll(/https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
    const host = m[1].toLowerCase();
    if (DOMINIOS_PROPIOS.includes(host)) continue;
    if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

/** ¿La directiva permite ese host? Acepta el comodín de subdominio. */
export function permitido(directiva: string, host: string): boolean {
  return directiva.split(/\s+/).some((origen) => {
    if (origen === `https://${host}`) return true;
    if (origen.startsWith("https://*.")) {
      const sufijo = origen.slice("https://*".length); // ".google-analytics.com"
      return host.endsWith(sufijo) && host.length > sufijo.length;
    }
    return false;
  });
}

describe("la CSP cubre todos los hosts desde los que se carga un script", () => {
  const ficheros = ficherosDeCodigo(RAIZ).filter(
    (r) => !r.endsWith(ESTE_FICHERO),
  );
  const directiva = scriptSrc(CONFIG);

  it("ningún fichero carga un script desde un host que la política no permita", () => {
    const huerfanos = ficheros
      .flatMap((ruta) =>
        hostsDeScript(readFileSync(ruta, "utf8"))
          .filter((host) => !permitido(directiva, host))
          .map((host) => `${ruta.replace(process.cwd() + "/", "")}: ${host}`),
      )
      .sort();

    expect(huerfanos).toEqual([]);
  });

  it("el detector encuentra el `.src =` a mano, no solo el <Script> de Next", () => {
    // El caso real: SpotifyPixel no usa <Script>.
    const aMano = `const script = document.createElement("script");
      script.src = "https://pixel.byspotify.com/ping.min.js";`;
    expect(hostsDeScript(aMano)).toEqual(["pixel.byspotify.com"]);

    const conScript = `<Script src="https://cdn.ajeno.com/x.js" />`;
    expect(hostsDeScript(conScript)).toEqual(["cdn.ajeno.com"]);

    // Un fichero que solo enlaza a una web no carga nada de ella.
    const soloEnlace = `<a href="https://www.spotify.com/es/legal/privacy-policy/">Política</a>`;
    expect(hostsDeScript(soloEnlace)).toEqual([]);
  });

  it("el comparador distingue el comodín de subdominio del comodín a secas", () => {
    // `*.google-analytics.com` cubre el recolector regional de GA4…
    expect(permitido("'self' https://*.google-analytics.com", "region1.google-analytics.com")).toBe(true);
    expect(permitido("'self' https://*.google-analytics.com", "www.google-analytics.com")).toBe(true);
    // …y NADA más: no es una barra libre.
    expect(permitido("'self' https://*.google-analytics.com", "google-analytics.com.malo.es")).toBe(false);
    expect(permitido("'self' https://*.google-analytics.com", "evil.com")).toBe(false);
    // Un host exacto no cubre sus subdominios.
    expect(permitido("'self' https://js.stripe.com", "otro.js.stripe.com")).toBe(false);
    expect(permitido("'self' https://js.stripe.com", "js.stripe.com")).toBe(true);
  });

  // — El guard se vigila a sí mismo —

  it("de verdad está mirando el árbol y leyendo la política", () => {
    expect(ficheros.length).toBeGreaterThan(200);
    expect(directiva).toContain("'self'");

    const conScripts = ficheros.filter((r) =>
      hostsDeScript(readFileSync(r, "utf8")).length > 0,
    );
    // Si esto cae a cero, el guard estaría pasando verde sobre un árbol que no
    // reconoce (ruta mal, extensiones mal) en vez de sobre uno limpio.
    expect(conScripts.length).toBeGreaterThanOrEqual(3);

    // Y el caso que lo originó tiene que seguir siendo visible desde aquí.
    const spotify = ficheros.find((r) => r.endsWith("SpotifyPixel.tsx"));
    expect(spotify).toBeDefined();
    expect(hostsDeScript(readFileSync(spotify!, "utf8"))).toContain(
      "pixel.byspotify.com",
    );
  });
});
