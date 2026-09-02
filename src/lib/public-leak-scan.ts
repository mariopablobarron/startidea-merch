/**
 * Barrido de fuga de proveedor sobre superficies PÚBLICAS vivas.
 *
 * Los patrones (`PUBLIC_SUPPLIER_LEAK_PATTERNS`) llevaban escritos desde la
 * fuga de MidOcean del 2026-07-20, pero **no los disparaba nadie**: su único
 * consumidor era `scripts/audit-supplier-leaks.ts`, que solo corre cuando un
 * humano lo teclea. La vigilancia viva cada 6 h la hace `money-smoke-test.mjs`,
 * que al ser un script Node suelto NO puede importar TypeScript y por eso lleva
 * su propia lista: vigila los NOMBRES de proveedor pero no los IDENTIFICADORES
 * internos (slugs `cif-`/`mak-`, SKUs de proveedor, la clave `sku` del RSC,
 * `xindao`, `cifrashop.com`). Es decir, la regla nº2 estaba vigilada por
 * costumbre y no por máquina justo en su mitad menos evidente.
 *
 * Esto saca la lógica del script a un módulo para que la lista canónica tenga
 * un disparador propio sin duplicarse una cuarta vez (la divergencia entre
 * copias es el fallo del 13-ago, ver `supplier-leak-paridad.test.ts`).
 */
import { PUBLIC_SUPPLIER_LEAK_PATTERNS } from "@/lib/public-supplier-leak-patterns";

export type LeakHit = { code: string; sample: string };

/**
 * Falsos positivos conocidos, aplicados sobre la posición REAL del match.
 * El script original usaba `html.indexOf(m)`, que devuelve la PRIMERA
 * aparición del texto y no la del match en curso: con dos ocurrencias, el
 * contexto examinado era el de otra: el filtro miraba donde no era.
 */
function esFalsoPositivo(html: string, code: string, match: string, index: number): boolean {
  // Los tokens de verificación de Google son cadenas aleatorias: casan con
  // patrones de SKU por pura combinatoria. Se mira la etiqueta que CONTIENE el
  // match (desde el `<` anterior), no una ventana de caracteres alrededor: una
  // ventana ancha indulta también a la fuga real que va justo al lado.
  const abre = html.lastIndexOf("<", index);
  if (abre !== -1) {
    const etiqueta = html.slice(abre, index);
    if (!etiqueta.includes(">") && /google-site-verification/i.test(etiqueta)) return true;
  }
  if (code === "supplier-sku") {
    // `mo1234` seguido de letra es parte de una palabra, no una referencia.
    const next = html.charAt(index + match.length);
    if (/[a-z]/i.test(next)) return true;
  }
  return false;
}

/** Todas las fugas de un HTML, con el patrón que las cazó. */
export function scanHtmlForLeaks(html: string): LeakHit[] {
  const hits: LeakHit[] = [];
  for (const p of PUBLIC_SUPPLIER_LEAK_PATTERNS) {
    // `re` es global y compartido entre llamadas: sin copia, `lastIndex` se
    // arrastra de una página a la siguiente y el barrido se salta fugas.
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (esFalsoPositivo(html, p.code, m[0], m.index)) continue;
      hits.push({ code: p.code, sample: m[0] });
      break; // una muestra por patrón basta: esto avisa, no inventaria.
    }
  }
  return hits;
}

/** Rutas relativas de un sitemap plano, en el orden en que vienen. */
export function pathsFromSitemap(xml: string, site: string): string[] {
  const paths: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1];
    if (!loc.startsWith(site)) continue;
    const path = loc.slice(site.length) || "/";
    paths.push(path.startsWith("/") ? path : `/${path}`);
  }
  return paths;
}

/**
 * Semillas + muestra del sitemap.
 *
 * Una lista fija de 11 rutas solo demuestra que no ha vuelto lo ya conocido;
 * las fichas de producto son 10.000 y son justo donde vive el dato de
 * proveedor. Se recorren por paso fijo (no aleatorio, para que un fallo se
 * pueda reproducir) y `offset` rota la ventana entre ejecuciones, de modo que
 * a lo largo de los días el barrido acaba pisando todo el sitemap.
 */
export function pickAuditRoutes(opts: {
  sitemapXml: string;
  site: string;
  seedRoutes: readonly string[];
  sample: number;
  offset: number;
}): string[] {
  const { sitemapXml, site, seedRoutes, sample, offset } = opts;
  const semillas = [...seedRoutes];
  const candidatas = pathsFromSitemap(sitemapXml, site).filter((p) => !semillas.includes(p));
  if (candidatas.length === 0 || sample <= 0) return semillas;

  const paso = Math.max(1, Math.floor(candidatas.length / sample));
  const inicio = ((offset % candidatas.length) + candidatas.length) % candidatas.length;
  const elegidas: string[] = [];
  for (let i = 0; i < sample && i * paso < candidatas.length; i++) {
    elegidas.push(candidatas[(inicio + i * paso) % candidatas.length]);
  }
  return [...semillas, ...new Set(elegidas)];
}

/**
 * `src/app/recursos/calculadora-rsc/page.tsx` → `/recursos/calculadora-rsc`.
 *
 * Devuelve null para las rutas con segmento dinámico (`[slug]`): esas no se
 * pueden pedir sin un valor, y para ellas está la muestra del sitemap, que
 * además trae datos reales de BD.
 */
export function routeFromPagePath(rel: string): string | null {
  const limpio = rel
    .replace(/^src\/app/, "")
    .replace(/\/page\.tsx$/, "")
    // Los grupos de ruta `(marketing)` no salen en la URL.
    .replace(/\/\([^/]+\)/g, "");
  if (limpio.includes("[")) return null;
  return limpio === "" ? "/" : limpio;
}

export type AuditVeredicto = "limpio" | "fuga" | "no-comprobado";

/**
 * Una superficie que no responde NO es una fuga.
 *
 * El script original metía los `http-error` en la misma bolsa que los
 * hallazgos, así que un corte de red del runner habría avisado a Mario de una
 * fuga que nadie ha visto. El money smoke ya aprendió esto: el trabajo falla
 * igual en los dos casos, pero no puede AFIRMAR una rotura que no consta.
 */
export function veredicto(opts: { fugas: number; inalcanzables: number; comprobadas: number }): AuditVeredicto {
  if (opts.fugas > 0) return "fuga";
  if (opts.comprobadas === 0 || opts.inalcanzables > 0) return "no-comprobado";
  return "limpio";
}
