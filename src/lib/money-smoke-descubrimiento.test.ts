import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  slugsDeProductoDelSitemap,
  muestraRepartida,
  // @ts-expect-error — .mjs sin tipos, importado a propósito desde el test
} from "../../scripts/money-smoke-test.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/money-smoke-test.mjs");

describe("slugsDeProductoDelSitemap", () => {
  it("se queda solo con las fichas de producto", () => {
    const xml = `<urlset>
      <url><loc>https://x.es/</loc></url>
      <url><loc>https://x.es/catalogo</loc></url>
      <url><loc>https://x.es/catalogo/taza-buena</loc></url>
      <url><loc>https://x.es/categorias/tazas</loc></url>
      <url><loc>https://x.es/catalogo/otra/cosa</loc></url>
    </urlset>`;
    expect(slugsDeProductoDelSitemap(xml)).toEqual(["taza-buena"]);
  });

  it("no revienta con un sitemap vacío o basura", () => {
    expect(slugsDeProductoDelSitemap("")).toEqual([]);
    expect(slugsDeProductoDelSitemap("<urlset></urlset>")).toEqual([]);
  });
});

describe("muestraRepartida", () => {
  it("recorre toda la lista en vez de quedarse con la cabecera", () => {
    const lista = Array.from({ length: 100 }, (_, i) => `p${i}`);
    const m = muestraRepartida(lista, 5);
    expect(m).toHaveLength(5);
    // Repartida: el último elegido está lejos del primero. Con "las primeras
    // N" esto valdría 4, y el guard probaría siempre el mismo rincón.
    expect(Number(m[4].slice(1)) - Number(m[0].slice(1))).toBeGreaterThan(50);
  });

  it("devuelve la lista entera si es más corta que la muestra", () => {
    expect(muestraRepartida(["a", "b"], 6)).toEqual(["a", "b"]);
    expect(muestraRepartida([], 6)).toEqual([]);
  });
});

/** Sitio de mentira: `vivos` son los slugs que cotizan de verdad. */
function servidorFalso(vivos: Set<string>) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const responde = (status: number, body: string, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(body);
    };
    if (url.pathname === "/sitemap.xml") {
      const urls = [...vivos].map((s) => `<url><loc>http://x/catalogo/${s}</loc></url>`).join("");
      return responde(200, `<urlset>${urls}</urlset>`, "application/xml");
    }
    if (url.pathname === "/api/products/cards") {
      const slug = url.searchParams.get("slugs") || "";
      const items = vivos.has(slug)
        ? [{ slug, name: "Producto", ref: "STM-AAA111", priceFromCents: 300 }]
        : [];
      return responde(200, JSON.stringify({ items }));
    }
    if (url.pathname === "/api/quote/calculate") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (!vivos.has(body.productSlug)) return responde(404, JSON.stringify({ error: "no existe" }));
      const conTecnica = Boolean(body.techniqueCode);
      return responde(
        200,
        JSON.stringify({
          ok: true,
          unitClientCents: conTecnica ? 447 : 335,
          markings: conTecnica ? [{ techniqueCode: body.techniqueCode, clientCost: { cents: 11167 } }] : [],
        }),
      );
    }
    if (url.pathname === "/catalogo") return responde(200, "<html>catálogo</html>", "text/html");
    if (url.pathname.startsWith("/catalogo/")) {
      const slug = url.pathname.slice("/catalogo/".length);
      if (!vivos.has(slug)) return responde(404, "no", "text/html");
      return responde(200, "<html>ficha limpia 3,35 €</html>", "text/html");
    }
    if (url.pathname === "/comparar") {
      const slug = url.searchParams.get("slugs") || "";
      return responde(200, vivos.has(slug) ? "<html>3,35 €</html>" : "<html>Consultar</html>", "text/html");
    }
    if (url.pathname === "/api/recommend") return responde(200, JSON.stringify({ items: [] }));
    return responde(200, "contenido limpio", "text/plain");
  });
  return new Promise<{ base: string; cerrar: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        cerrar: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function correrSmoke(base: string, env: Record<string, string> = {}) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT],
      {
        env: {
          ...process.env,
          BASE: base,
          SMOKE_NO_RETRY: "1",
          SMOKE_BUDGET_MS: "20000",
          GITHUB_OUTPUT: "",
          ...env,
        },
      },
      (err, stdout, stderr) => resolve({ code: err ? Number((err as NodeJS.ErrnoException).code ?? 1) : 0, out: stdout + stderr }),
    );
  });
}

describe("el producto de prueba se descubre (regresión del falso rojo del 02-sep)", () => {
  it("sigue verde cuando el producto preferido se ha desactivado", async () => {
    // Exactamente el cuadro de producción: `taza` ya no cotiza, pero el
    // catálogo está sano. Antes, esto eran 4 invariantes de dinero en rojo.
    const { base, cerrar } = await servidorFalso(new Set(["otra-taza-viva"]));
    try {
      const { code, out } = await correrSmoke(base, { SLUG: "taza" });
      expect(out).toContain("ya no cotiza");
      expect(out).toContain("otra-taza-viva");
      expect(out).toContain("✅");
      expect(code).toBe(0);
    } finally {
      await cerrar();
    }
  }, 40_000);

  it("SUSPENDE en rojo si NINGÚN producto del catálogo cotiza", async () => {
    // Un guard que no sabe suspender no vigila nada: si el catálogo entero
    // deja de dar precio, esto tiene que doler.
    const { base, cerrar } = await servidorFalso(new Set());
    try {
      const { code, out } = await correrSmoke(base, { SLUG: "taza" });
      expect(out).toContain("hay al menos un producto cotizable en el catálogo");
      expect(out).toContain("INVARIANTE DE NEGOCIO ROTA");
      expect(code).toBe(1);
    } finally {
      await cerrar();
    }
  }, 40_000);

  it("sin producto NO se apaga el barrido de fuga en las superficies de contenido", async () => {
    const { base, cerrar } = await servidorFalso(new Set());
    try {
      const { out } = await correrSmoke(base, { SLUG: "taza" });
      // /llms.txt, /docs/api y /privacidad no dependen de ningún producto.
      expect(out).toContain("sin proveedor en GET /llms.txt");
      expect(out).toMatch(/✓ sin proveedor en GET \/llms\.txt/);
    } finally {
      await cerrar();
    }
  }, 40_000);
});
