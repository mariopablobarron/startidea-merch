import { describe, expect, it } from "vitest";
import {
  pathsFromSitemap,
  pickAuditRoutes,
  routeFromPagePath,
  scanHtmlForLeaks,
  veredicto,
} from "./public-leak-scan";

const SITE = "https://merchandising.startidea.es";

describe("scanHtmlForLeaks", () => {
  it("caza el CDN de proveedor en el HTML público", () => {
    const hits = scanHtmlForLeaks(`<img src="https://cdn1.midocean.com/foto.jpg">`);
    expect(hits.map((h) => h.code)).toContain("midocean-cdn");
  });

  it("cubre lo que el barrido vivo NO vigilaba: identificadores internos", () => {
    // Estos cuatro son la razón de ser del cableado: `money-smoke-test.mjs`
    // busca NOMBRES de proveedor y ninguno de estos lleva uno.
    const casos: Array<[string, string]> = [
      ["xindao-cdn", `<img src="https://media.xindao.eu/x.jpg">`],
      ["cifra-domain", `<a href="https://cifrashop.com/p/1">ver</a>`],
      ["slug-prefix-cif", `<a href="/catalogo/cif-guante-nitrilo">guante</a>`],
      ["slug-prefix-mak", `<a href="/catalogo/mak-bolsa-algodon">bolsa</a>`],
    ];
    for (const [code, html] of casos) {
      expect(scanHtmlForLeaks(html).map((h) => h.code), code).toContain(code);
    }
  });

  it("no arrastra `lastIndex` entre páginas: la segunda se escanea entera", () => {
    // Los patrones son `/g` y viven en una constante compartida. Reutilizar el
    // objeto RegExp deja `lastIndex` apuntando al final de la página anterior,
    // así que la siguiente empieza a mirar por la mitad y se salta fugas.
    const pagina = `<img src="https://cdn1.midocean.com/foto.jpg">`;
    expect(scanHtmlForLeaks(pagina)).toHaveLength(scanHtmlForLeaks(pagina).length);
    expect(scanHtmlForLeaks(pagina).map((h) => h.code)).toContain("midocean-cdn");
    // Y dos veces seguidas sobre distinto contenido, que es el caso real.
    scanHtmlForLeaks(`<p>${"relleno ".repeat(200)}</p>`);
    expect(scanHtmlForLeaks(pagina).map((h) => h.code)).toContain("midocean-cdn");
  });

  it("filtra el token de verificación de Google, que casa por combinatoria", () => {
    const html = `<meta name="google-site-verification" content="mo1234">`;
    expect(scanHtmlForLeaks(html).map((h) => h.code)).not.toContain("supplier-sku");
  });

  it("mira el contexto del match en curso, no el de la primera aparición", () => {
    // La primera `mo1234` es del token de Google y se descarta; la segunda es
    // una referencia de verdad. Con `indexOf` se examinaba dos veces el
    // contexto de la primera y la fuga real pasaba.
    const html =
      `<meta name="google-site-verification" content="mo1234">` +
      `<a href="/img/mo1234.jpg">ficha</a>`;
    expect(scanHtmlForLeaks(html).map((h) => h.code)).toContain("supplier-sku");
  });

  it("no confunde una palabra que empieza igual con una referencia", () => {
    expect(scanHtmlForLeaks(`<p>mo1234abc</p>`).map((h) => h.code)).not.toContain("supplier-sku");
  });

  it("una página legítima no dispara nada", () => {
    expect(scanHtmlForLeaks(`<h1>Sin fluff, con cifras.</h1><p>Adivina el plazo.</p>`)).toEqual([]);
  });
});

describe("pathsFromSitemap", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>${SITE}/</loc></url>
    <url><loc>${SITE}/catalogo</loc></url>
    <url><loc>${SITE}/catalogo/camiseta-runner</loc></url>
    <url><loc>https://otro-dominio.example/fuera</loc></url>
  </urlset>`;

  it("saca las rutas relativas del propio sitio", () => {
    expect(pathsFromSitemap(xml, SITE)).toEqual(["/", "/catalogo", "/catalogo/camiseta-runner"]);
  });

  it("descarta las URLs de otro dominio", () => {
    expect(pathsFromSitemap(xml, SITE).join(" ")).not.toContain("otro-dominio");
  });
});

describe("pickAuditRoutes", () => {
  const xml = `<urlset>${Array.from(
    { length: 100 },
    (_, i) => `<url><loc>${SITE}/catalogo/producto-${i}</loc></url>`,
  ).join("")}</urlset>`;
  const base = { sitemapXml: xml, site: SITE, seedRoutes: ["/", "/catalogo"], sample: 10 };

  it("mantiene siempre las semillas", () => {
    const rutas = pickAuditRoutes({ ...base, offset: 0 });
    expect(rutas.slice(0, 2)).toEqual(["/", "/catalogo"]);
  });

  it("añade fichas de producto, que es donde vive el dato de proveedor", () => {
    const rutas = pickAuditRoutes({ ...base, offset: 0 });
    expect(rutas.filter((r) => r.startsWith("/catalogo/producto-")).length).toBe(10);
  });

  it("es reproducible: mismo offset, mismas rutas", () => {
    expect(pickAuditRoutes({ ...base, offset: 7 })).toEqual(pickAuditRoutes({ ...base, offset: 7 }));
  });

  it("rota con el offset, para no mirar siempre las mismas 10 de 10.000", () => {
    const a = pickAuditRoutes({ ...base, offset: 0 });
    const b = pickAuditRoutes({ ...base, offset: 3 });
    expect(b).not.toEqual(a);
  });

  it("no repite rutas aunque el offset dé la vuelta", () => {
    const rutas = pickAuditRoutes({ ...base, offset: 97 });
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it("sin sitemap se queda en las semillas en vez de no comprobar nada", () => {
    expect(pickAuditRoutes({ ...base, sitemapXml: "", offset: 0 })).toEqual(["/", "/catalogo"]);
  });
});

describe("veredicto", () => {
  it("una superficie caída NO se cuenta como fuga", () => {
    expect(veredicto({ fugas: 0, inalcanzables: 1, comprobadas: 10 })).toBe("no-comprobado");
  });

  it("una fuga manda aunque además haya superficies caídas", () => {
    expect(veredicto({ fugas: 1, inalcanzables: 3, comprobadas: 10 })).toBe("fuga");
  });

  it("no comprobar nada no es estar limpio", () => {
    expect(veredicto({ fugas: 0, inalcanzables: 0, comprobadas: 0 })).toBe("no-comprobado");
  });

  it("limpio es haber comprobado y no haber encontrado nada", () => {
    expect(veredicto({ fugas: 0, inalcanzables: 0, comprobadas: 11 })).toBe("limpio");
  });
});

describe("routeFromPagePath", () => {
  it("convierte la página en la ruta que sirve", () => {
    expect(routeFromPagePath("src/app/recursos/calculadora-rsc/page.tsx")).toBe(
      "/recursos/calculadora-rsc",
    );
  });

  it("la raíz es /", () => {
    expect(routeFromPagePath("src/app/page.tsx")).toBe("/");
  });

  it("los grupos de ruta no salen en la URL", () => {
    expect(routeFromPagePath("src/app/(marketing)/promociones/page.tsx")).toBe("/promociones");
  });

  it("descarta las dinámicas: no se pueden pedir sin un valor", () => {
    expect(routeFromPagePath("src/app/catalogo/[slug]/page.tsx")).toBeNull();
  });
});
