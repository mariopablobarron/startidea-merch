/**
 * Guard de las rutas de API PÚBLICAS: ninguna puede emitir la referencia ni el
 * nombre del proveedor.
 *
 * Por qué existe, y por qué no bastaba el que ya había. El guard de
 * `superficies-publicas-sin-proveedor.guard.test.ts` recorre las PÁGINAS
 * (`page.tsx`) buscando el NOMBRE del proveedor en el texto fuente. Eso deja
 * dos huecos, y los dos son justo por donde nos han mordido:
 *
 *   1. La fuga real del 2026-07-20 no fue una página: fue `/api/recommend`
 *      sirviendo `cdn1.midocean.com` en las imágenes. Una API no tiene
 *      `page.tsx`, así que aquel guard no la habría visto nunca.
 *   2. `supplierRef` es un CÓDIGO (`MO1234`, `21790`), no un nombre. Un
 *      barrido que busca «midocean» no lo detecta aunque salga entero en el
 *      JSON.
 *
 * Medido el 02-sep antes de escribir esto: de 61 rutas públicas, 6 mencionan
 * `supplierRef` y las 6 están limpias —`publicRef()`, `sku: variant.id`,
 * imágenes por `proxyImageUrl()`—, casi todas con un comentario que dice
 * «NUNCA supplierRef en endpoint público». Es decir: hoy no hay fuga. Lo que
 * no había es nada que lo sostenga mañana.
 *
 * El guard tiene dos mitades, y hacen falta las dos:
 *
 *   · DESCUBRIMIENTO (estático): recorre TODAS las rutas de `src/app/api` y
 *     exige que cualquiera pública que toque `supplierRef` esté declarada
 *     abajo con su motivo. Una ruta nueva que lo toque y que nadie apunte
 *     suspende sola. No es una lista blanca: la lista no decide QUÉ se mira
 *     —se mira todo—, solo documenta lo ya revisado.
 *   · CENTINELA (comportamiento): invoca el handler de verdad con un Prisma
 *     falso que devuelve un `supplierRef` imposible, y comprueba que ese valor
 *     no aparece en el JSON que sale. Es el mismo patrón que
 *     `public-quote-view.test.ts` usa con `midoceanOrderId`: probar la salida,
 *     no el texto fuente. Un `select` puede traerse el campo sin filtrarlo
 *     —eso es legítimo, `v1/products` lo necesita para normalizar variantes de
 *     Cifra— y lo único que importa es si acaba en la respuesta.
 *
 * Decisión de Mario (02-sep), sin excepción: «el cliente que nunca sepa el
 * nombre de dónde compramos o de nuestros proveedores». Ver
 * [[rule_no_supplier_exposure]].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();

/**
 * Rutas de `src/app/api` que NO ve un cliente anónimo. Ahí el dato del
 * proveedor es legítimo y necesario —el equipo cursa el pedido con él—, que es
 * justo la distinción que separa una fuga de un dato interno. Los `/api/cron`
 * y `/api/webhooks` hablan con nosotros mismos o con Stripe, no con el cliente.
 */
const NO_PUBLICAS = ["/admin/", "/clientes/", "/cron/", "/webhooks/", "/internal/"];

/**
 * Las rutas públicas que hoy tocan `supplierRef`, con el motivo por el que es
 * seguro. Revisadas una a una el 02-sep. Si aparece una nueva, el test de
 * descubrimiento suspende y hay que mirarla y anotarla aquí — o quitarle el
 * campo.
 */
const TOCAN_SUPPLIERREF: Record<string, string> = {
  "src/app/api/recommend/route.ts":
    "solo lo nombra en el comentario «NUNCA supplierRef en endpoint público»; emite publicRef(p)",
  "src/app/api/v1/products/route.ts":
    "lo selecciona de verdad, pero solo para normalizeLegacyCifraVariant(); emite publicRef(p) y sku: variant.id",
  "src/app/api/v1/quotes/route.ts":
    "solo en el comentario; el match se hace por internalRef",
  "src/app/api/quote/calculate/route.ts":
    "solo en el comentario; emite publicRef(product)",
  "src/app/api/search/suggest/route.ts":
    "solo en el comentario; emite publicRef(p)",
  "src/app/api/cart-quote/[id]/route.ts":
    "solo en el comentario; el carrito guarda productRef público",
};

/** Todas las rutas de API del árbol, descubiertas — no enumeradas. */
function descubrirRutasApi(dir = "src/app/api", acc: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) descubrirRutasApi(rel, acc);
    else if (e.name === "route.ts") acc.push(rel);
  }
  return acc;
}

const RUTAS_PUBLICAS = descubrirRutasApi().filter(
  (r) => !NO_PUBLICAS.some((p) => `/${r}`.includes(p)),
);

describe("descubrimiento: ninguna ruta pública toca supplierRef sin estar revisada", () => {
  it("encuentra rutas públicas de verdad (el propio barrido no está roto)", () => {
    // Si un refactor mueve `src/app/api` o cambia el nombre de los handlers,
    // el filtro devolvería 0 y el guard pasaría sin mirar nada. Este test es
    // el que impide ese falso verde.
    expect(RUTAS_PUBLICAS.length).toBeGreaterThan(30);
    expect(RUTAS_PUBLICAS).toContain("src/app/api/v1/products/route.ts");
  });

  it("toda ruta pública que mencione supplierRef está declarada con su motivo", () => {
    const sinDeclarar = RUTAS_PUBLICAS.filter(
      (r) =>
        readFileSync(join(RAIZ, r), "utf8").includes("supplierRef") &&
        !(r in TOCAN_SUPPLIERREF),
    );
    expect(
      sinDeclarar,
      `Estas rutas PÚBLICAS mencionan supplierRef y nadie las ha revisado. ` +
        `Comprueba que no lo emiten en la respuesta y decláralas en ` +
        `TOCAN_SUPPLIERREF con el motivo:\n  ${sinDeclarar.join("\n  ")}`,
    ).toEqual([]);
  });

  it("la lista declarada no acumula rutas que ya no existen ni ya no lo tocan", () => {
    // Una lista que solo crece deja de describir la realidad y se convierte en
    // adorno. Si alguien limpia una ruta, aquí se entera.
    const sobran = Object.keys(TOCAN_SUPPLIERREF).filter(
      (r) =>
        !RUTAS_PUBLICAS.includes(r) ||
        !readFileSync(join(RAIZ, r), "utf8").includes("supplierRef"),
    );
    expect(
      sobran,
      `Sobran en TOCAN_SUPPLIERREF (ya no existen o ya no tocan supplierRef):\n  ${sobran.join("\n  ")}`,
    ).toEqual([]);
  });
});

/**
 * Centinela: un valor que no puede salir de ningún sitio salvo de la columna
 * `supplierRef` del mock. Si aparece en la respuesta, viene de ahí.
 */
const CENTINELA = "MO-CENTINELA-NO-DEBE-SALIR-9999";

const productoFindMany = vi.fn();
const productoCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: (...a: unknown[]) => productoFindMany(...a),
      count: (...a: unknown[]) => productoCount(...a),
    },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: vi.fn().mockResolvedValue({ ok: true, keyId: "k1", scopes: [] }),
  requireScope: (auth: unknown) => auth,
}));

/**
 * Un producto tal y como lo devuelve el `select` de `/api/v1/products`, con el
 * proveedor puesto a `cifra` A PROPÓSITO: es la rama que pasa `supplierRef` a
 * `normalizeLegacyCifraVariant()`, o sea la única que hoy tiene un motivo real
 * para leerlo. Se prueba el camino peligroso, no el cómodo.
 */
function productoConCentinela() {
  return {
    slug: "producto-de-prueba",
    id: "p_1",
    internalRef: "STM-PRUEBA",
    name: "Producto de prueba",
    brand: null,
    shortDescription: "Descripción",
    enhancedShortDescription: null,
    material: null,
    primaryImageUrl: "/api/m/abc123",
    supplier: "cifra",
    supplierRef: CENTINELA,
    countryOfOrigin: "ES",
    weightG: 100,
    lengthMm: 10,
    widthMm: 10,
    heightMm: 10,
    category: { name: "Categoría", slug: "categoria" },
    override: null,
    variants: [
      {
        id: "v_1",
        sku: `${CENTINELA}-ROJO`,
        gtin: null,
        colorName: "Rojo",
        colorGroup: "rojo",
        colorHex: "#f00",
        stockQty: 5,
        size: "M",
      },
    ],
    positions: [],
  };
}

describe("centinela: GET /api/v1/products no emite la referencia de proveedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    productoFindMany.mockResolvedValue([productoConCentinela()]);
    productoCount.mockResolvedValue(1);
  });

  async function pedirCatalogo() {
    const { GET } = await import("@/app/api/v1/products/route");
    const res = await GET(new Request("https://x/api/v1/products?page=1&pageSize=20"));
    return { res, cuerpo: await res.text() };
  }

  it("responde 200 y sirve el producto (el arnés llega de verdad a la serialización)", async () => {
    const { res, cuerpo } = await pedirCatalogo();
    expect(res.status).toBe(200);
    // Sin esto, un cambio que rompiera la ruta dejaría el test en verde por
    // vacío: no encontrar el centinela en una respuesta de error no prueba nada.
    expect(cuerpo).toContain("Producto de prueba");
    expect(cuerpo).toContain("STM-PRUEBA");
  });

  it("no filtra el supplierRef por ningún campo, ni siquiera dentro del sku de la variante", () => {
    // El `sku` es el sitio con más historia: v1 lo conserva como alias
    // documentado y durante un tiempo llevó la referencia del proveedor. Hoy
    // emite `variant.id`.
    return pedirCatalogo().then(({ cuerpo }) => {
      expect(cuerpo).not.toContain(CENTINELA);
    });
  });

  it("no nombra al proveedor aunque el producto sea de uno concreto", async () => {
    const { cuerpo } = await pedirCatalogo();
    expect(cuerpo.toLowerCase()).not.toContain("cifra");
    expect(cuerpo.toLowerCase()).not.toContain("midocean");
    expect(cuerpo.toLowerCase()).not.toContain("makito");
  });
});
