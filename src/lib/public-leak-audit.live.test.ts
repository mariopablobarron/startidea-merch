/**
 * Barrido ANTI-FUGA contra producción viva. No corre en el CI normal: hay que
 * pedirlo con `LEAK_AUDIT_LIVE=1` (lo hace `.github/workflows/supplier-leak-audit.yml`
 * cada 6 h). Sin esa variable se salta, para que un PR no dependa de la red.
 *
 * POR QUÉ EXISTE — había dos vigilancias y un hueco justo entre ellas:
 *
 *   · `superficies-publicas-sin-proveedor.guard.test.ts` recorre TODAS las
 *     páginas de `src/app` por descubrimiento, pero lee el TEXTO FUENTE. Su
 *     propio comentario reconoce el límite: «el contenido que se monta con
 *     datos de BD no lo ve, y de eso responde el smoke contra producción».
 *   · `money-smoke-test.mjs` sí mira producción cada 6 h, pero sobre SIETE
 *     rutas escritas a mano. Es una lista blanca: demuestra que no ha vuelto
 *     lo ya arreglado. Las tres páginas de `/recursos` que en agosto sirvieron
 *     26 menciones de proveedor en abierto no estaban en esa lista, y por eso
 *     ninguna falló.
 *
 * Es decir: una página nueva que monte su contenido con datos de BD no la
 * miraba NADIE en vivo. Aquí se juntan las dos mitades — descubrimiento de
 * superficies (repo + sitemap) contra el HTML realmente servido — usando la
 * lista canónica `PUBLIC_SUPPLIER_LEAK_PATTERNS`, que hasta hoy solo disparaba
 * un humano tecleando `bun scripts/audit-supplier-leaks.ts`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  pickAuditRoutes,
  routeFromPagePath,
  scanHtmlForLeaks,
  veredicto,
} from "./public-leak-scan";
import { PUBLIC_API_BARRIDAS, urlDeBarrido } from "./public-api-surfaces";

const VIVO = process.env.LEAK_AUDIT_LIVE === "1";
const SITE = process.env.SITE_URL || "https://merchandising.startidea.es";
/** Cuántas fichas del sitemap se miran por ejecución (≈10.000 en total). */
const MUESTRA = Number(process.env.LEAK_AUDIT_SAMPLE || 40);
const RAIZ = process.cwd();
/** Lo lee el paso de alerta del workflow para no mandar el aviso equivocado. */
export const VEREDICTO_FICHERO = join(RAIZ, "leak-audit-veredicto.txt");

/** Mismo criterio que el guard estático: tras token o sesión no hay público. */
const NO_PUBLICAS = ["/admin/", "/clientes/", "/pay/", "/proof/"];

function descubrirPaginasPublicas(dir = "src/app", acc: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) descubrirPaginasPublicas(rel, acc);
    else if (e.name === "page.tsx" && !NO_PUBLICAS.some((p) => rel.includes(p))) acc.push(rel);
  }
  return acc;
}

/**
 * Sin `user-agent` propio y con reintento, igual que `money-smoke-test.mjs`,
 * que lleva meses barriendo estas mismas superficies desde los runners.
 *
 * El primer disparo real falló con las 70 rutas en «error de red»: el borrador
 * mandaba un UA inventado —y el sitio tiene fail2ban, con la IP de la estación
 * en `ignoreip` pero no la de los runners, así que en local no se vio— y el
 * `catch` se tragaba el motivo, con lo que el log no permitía ni diagnosticarlo.
 * De ahí las dos cosas: no inventar UA, y **decir siempre por qué falló**.
 */
async function traer(ruta: string): Promise<{ html: string } | { fallo: string }> {
  let ultimo = "";
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(`${SITE}${ruta}`, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) return { html: await r.text() };
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (intento === 1) await new Promise((r) => setTimeout(r, 1_500));
  }
  return { fallo: ultimo };
}

/**
 * Igual que `traer`, pero para APIs: devuelve el cuerpo **con cualquier código
 * HTTP**. Un 401 o un 400 no es una superficie caída, es una respuesta — y su
 * cuerpo llega igual al cliente, así que también se escanea. Solo un fallo de
 * red o un timeout cuentan como «sin comprobar»: eso es lo que distingue una
 * fuga de un problema del runner, que el 03-sep costó un diagnóstico entero.
 */
async function traerCrudo(ruta: string): Promise<{ html: string } | { fallo: string }> {
  let ultimo = "";
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(`${SITE}${ruta}`, { signal: AbortSignal.timeout(20_000) });
      const ct = r.headers.get("content-type") || "";
      // Los binarios no se escanean como texto: convertir bytes de imagen a
      // string produce coincidencias por combinatoria, no fugas.
      if (!/text|json|xml|javascript/i.test(ct)) return { html: "" };
      return { html: await r.text() };
    } catch (e) {
      ultimo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (intento === 1) await new Promise((r) => setTimeout(r, 1_500));
  }
  return { fallo: ultimo };
}

/** Barrido con concurrencia acotada: 70 superficies en serie no caben en el reloj. */
async function enParalelo<T, R>(items: T[], limite: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, async () => {
      for (let i = siguiente++; i < items.length; i = siguiente++) salida[i] = await fn(items[i]);
    }),
  );
  return salida;
}

describe.skipIf(!VIVO)("barrido anti-fuga contra producción", () => {
  it(
    "ninguna superficie pública sirve un identificador de proveedor",
    { timeout: 300_000 },
    async () => {
      const estaticas = descubrirPaginasPublicas()
        .map(routeFromPagePath)
        .filter((r): r is string => r !== null);

      // La ventana rota con las horas para que, a lo largo de los días, el
      // muestreo acabe pisando todo el sitemap sin barrer 10.000 fichas de una
      // vez. Determinista dentro de la misma hora: un fallo se puede repetir.
      const offset = Math.floor(Date.now() / 3_600_000);
      const sitemap = await traer("/sitemap.xml");
      const rutas = pickAuditRoutes({
        sitemapXml: "html" in sitemap ? sitemap.html : "",
        site: SITE,
        seedRoutes: estaticas,
        sample: MUESTRA,
        offset,
      });

      const fugas: string[] = [];
      let inalcanzables = 0;
      let comprobadas = 0;

      // 6 a la vez: amable con el sitio (el barrido corre cada 6 h) y cabe de
      // sobra en el reloj del test.
      const resultados = await enParalelo(rutas, 6, async (ruta) => ({ ruta, res: await traer(ruta) }));
      for (const { ruta, res } of resultados) {
        if ("fallo" in res) {
          inalcanzables++;
          console.log(`  · sin comprobar ${ruta} (${res.fallo})`);
          continue;
        }
        comprobadas++;
        for (const hit of scanHtmlForLeaks(res.html)) {
          // La muestra NO se imprime: sería publicar la fuga en un log público.
          fugas.push(`${ruta} → ${hit.code}`);
        }
      }

      // Las APIs públicas: donde ocurrió la fuga que origina esta vigilancia
      // (`/api/recommend` servía `cdn1.midocean.com` el 2026-07-20) y lo único
      // que ninguna máquina miraba en vivo. El slug sale del propio sitemap,
      // para que la consulta traiga un producto REAL sin depender de un
      // identificador escrito a mano que caduque al cambiar el catálogo.
      const slugDelDia =
        rutas.find((r) => r.startsWith("/catalogo/") && r.length > "/catalogo/".length)?.slice(
          "/catalogo/".length,
        ) ?? null;
      const apis = PUBLIC_API_BARRIDAS.map((a) => urlDeBarrido(a, slugDelDia));
      const resApis = await enParalelo(apis, 4, async (ruta) => ({ ruta, res: await traerCrudo(ruta) }));
      for (const { ruta, res } of resApis) {
        if ("fallo" in res) {
          inalcanzables++;
          console.log(`  · sin comprobar ${ruta} (${res.fallo})`);
          continue;
        }
        comprobadas++;
        // La ruta lleva la consulta, y la consulta lleva un slug: se recorta
        // para que el log no publique qué producto se miró junto al hallazgo.
        const etiqueta = ruta.split("?")[0];
        for (const hit of scanHtmlForLeaks(res.html)) fugas.push(`${etiqueta} → ${hit.code}`);
      }

      const total = rutas.length + apis.length;
      const v = veredicto({ fugas: fugas.length, inalcanzables, comprobadas });
      console.log(
        `  ${total} superficies (${rutas.length} páginas + ${apis.length} APIs) · ${comprobadas} comprobadas · ${inalcanzables} sin comprobar · ${fugas.length} fugas`,
      );

      // El veredicto se deja por escrito ANTES de suspender, porque el paso que
      // avisa por Telegram solo ve el código de salida del job y hasta hoy
      // mandaba el mismo texto para los tres casos. La ruta no se escribe: el
      // fichero viaja en el log del runner, y nombrar la superficie con fuga
      // ahí sería publicarla.
      writeFileSync(
        VEREDICTO_FICHERO,
        `${v} ${total} ${comprobadas} ${inalcanzables} ${fugas.length}\n`,
      );

      // Se afirma lo que consta: una superficie caída no es una fuga, pero
      // tampoco es un verde. Los tres casos suspenden, con mensajes distintos.
      expect(fugas, `FUGA DE PROVEEDOR en producción: ${fugas.join(", ")}`).toEqual([]);
      expect(
        v,
        v === "inalcanzable"
          ? `no respondió NINGUNA de las ${total} superficies: es un problema de red o del host, no una fuga`
          : `no se pudo comprobar (${inalcanzables} de ${total} superficies sin respuesta)`,
      ).toBe("limpio");
    },
  );
});
