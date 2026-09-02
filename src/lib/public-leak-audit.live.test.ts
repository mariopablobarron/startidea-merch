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
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  pickAuditRoutes,
  routeFromPagePath,
  scanHtmlForLeaks,
  veredicto,
} from "./public-leak-scan";

const VIVO = process.env.LEAK_AUDIT_LIVE === "1";
const SITE = process.env.SITE_URL || "https://merchandising.startidea.es";
/** Cuántas fichas del sitemap se miran por ejecución (≈10.000 en total). */
const MUESTRA = Number(process.env.LEAK_AUDIT_SAMPLE || 40);
const RAIZ = process.cwd();

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

async function traer(ruta: string): Promise<{ html: string } | { fallo: string }> {
  try {
    const r = await fetch(`${SITE}${ruta}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "startidea-leak-audit" },
    });
    if (!r.ok) return { fallo: `HTTP ${r.status}` };
    return { html: await r.text() };
  } catch {
    return { fallo: "error de red" };
  }
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

      for (const ruta of rutas) {
        const res = await traer(ruta);
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

      const v = veredicto({ fugas: fugas.length, inalcanzables, comprobadas });
      console.log(
        `  ${rutas.length} rutas · ${comprobadas} comprobadas · ${inalcanzables} sin comprobar · ${fugas.length} fugas`,
      );
      // Se afirma lo que consta: una superficie caída no es una fuga, pero
      // tampoco es un verde. Las dos cosas suspenden, con mensajes distintos.
      expect(fugas, `FUGA DE PROVEEDOR en producción: ${fugas.join(", ")}`).toEqual([]);
      expect(v, `no se pudo comprobar (${inalcanzables} superficies sin respuesta)`).toBe("limpio");
    },
  );
});
