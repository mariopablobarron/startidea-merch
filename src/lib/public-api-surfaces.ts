/**
 * Catálogo de las APIs PÚBLICAS que barre el anti-fuga vivo.
 *
 * POR QUÉ EXISTE — el barrido de `public-leak-audit.live.test.ts` descubre
 * `page.tsx` y muestrea el sitemap, así que mira **páginas**. Las respuestas
 * JSON de las APIs públicas quedaban fuera, y ahí es justo donde ocurrió la
 * fuga que da origen a toda esta vigilancia: el 2026-07-20 `/api/recommend`
 * servía `cdn1.midocean.com` en `primaryImageUrl`. Hoy `/api/products/cards`
 * selecciona esos mismos dos campos de riesgo (`internalRef`,
 * `primaryImageUrl`) y **ninguna máquina mira lo que devuelve en producción**.
 *
 * POR QUÉ UN CATÁLOGO Y NO SOLO DESCUBRIMIENTO — una lista blanca a secas es
 * lo que este proyecto ya aprendió a no hacer: solo demuestra que no ha vuelto
 * lo viejo. Pero con las APIs hay dos cosas que el descubrimiento ciego no
 * puede resolver:
 *
 *   1. **Sin parámetros no devuelven nada.** `/api/search/suggest` sin `q`
 *      responde `{"products":[],"categories":[]}`: barrer eso es teatro. El
 *      dato de proveedor solo aparece cuando la respuesta trae producto.
 *   2. **Un GET puede tener efecto.** `/api/newsletter/unsubscribe` da de baja
 *      y `/api/voice-agent/signed-url` abre sesión con coste. Pedirlas cada
 *      6 h desde un runner sería un daño causado por la propia vigilancia.
 *
 * La salida es declarar, no elegir: `public-api-surfaces.guard.test.ts`
 * descubre TODAS las rutas públicas con `GET` y exige que cada una esté aquí,
 * o barrida con su consulta o excluida **con motivo escrito**. Una API pública
 * nueva suspende el guard hasta que alguien decida qué hacer con ella; lo que
 * no puede es entrar en producción sin que nadie la haya mirado.
 */

/** Superficie que el barrido vivo pide y escanea. */
export type ApiBarrida = {
  ruta: string;
  /**
   * Consulta que hace que la respuesta traiga datos de verdad. `{slug}` se
   * sustituye por un slug de producto REAL sacado del sitemap del día: así el
   * barrido no depende de un identificador escrito a mano que caduque cuando
   * el catálogo cambie.
   */
  query?: string;
  /** Qué se espera ver ahí; es lo que justifica barrerla. */
  porQue: string;
};

/** Superficie pública con `GET` que NO se pide, y la razón. */
export type ApiExcluida = { ruta: string; motivo: string };

export const PUBLIC_API_BARRIDAS: readonly ApiBarrida[] = [
  {
    ruta: "/api/products/cards",
    query: "slugs={slug}",
    porQue: "sirve internalRef y primaryImageUrl — los dos campos de la fuga de MidOcean",
  },
  { ruta: "/api/search/suggest", query: "q=botella", porQue: "devuelve productos y categorías por nombre" },
  { ruta: "/api/promotions/active", porQue: "promociones con su ámbito de producto" },
  { ruta: "/api/reviews/public", porQue: "reseñas con el producto al que apuntan" },
  { ruta: "/api/impact", porQue: "agregados de pedidos servidos" },
  { ruta: "/api/ruleta/ab", porQue: "identificador de experimento servido al navegador" },
  { ruta: "/api/health", porQue: "lo primero que se mira desde fuera; barato de comprobar" },
  {
    ruta: "/api/v1/products",
    porQue: "API de partners: sin credencial responde 401, y el cuerpo del error también se escanea",
  },
];

export const PUBLIC_API_EXCLUIDAS: readonly ApiExcluida[] = [
  {
    ruta: "/api/media",
    motivo:
      "proxy de imagen firmado: responde bytes, no texto, y sin firma válida solo devuelve 400. De que no delate al proveedor responde su propia suite.",
  },
  {
    ruta: "/api/calculadora-rsc/pdf",
    motivo: "responde un PDF binario y exige el id de una simulación existente; el PDF se escanea en su propia suite.",
  },
  {
    ruta: "/api/newsletter/unsubscribe",
    motivo: "EFECTO: da de baja a quien traiga el token. La vigilancia no puede causar el daño que vigila.",
  },
  { ruta: "/api/outbound/unsubscribe", motivo: "EFECTO: igual que la anterior, baja de una lista." },
  {
    ruta: "/api/voice-agent/signed-url",
    motivo: "EFECTO Y COSTE: abre sesión contra el proveedor de voz. Pedirla cada 6 h se factura.",
  },
  {
    ruta: "/api/search/semantic",
    motivo:
      "NO SE PUEDE BARRER HOY: tarda ~153 s en responder (medido el 2026-09-04 en producción). Carga los 6.258 vectores con findMany y Prisma deserializa 9,6 M de doubles; la similitud en sí son 29 ms. Incluirla daría 'sin comprobar' cada 6 h por una lentitud que no es una fuga. Escalado a Mario: la ruta es pública y retiene el proceso 2,5 min por petición.",
  },
  {
    ruta: "/api/webhooks/whatsapp",
    motivo: "endpoint de verificación de Meta, no una superficie de cliente; sin el reto responde 403.",
  },
];

/** Prefijos que no son superficie pública: tras token o sesión no hay público. */
export const API_NO_PUBLICAS = ["/api/admin/", "/api/clientes/", "/api/cron/"] as const;

/** `src/app/api/products/cards/route.ts` → `/api/products/cards`; null si es dinámica. */
export function rutaApiDesdeFichero(rel: string): string | null {
  const limpio = rel.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
  if (limpio.includes("[")) return null;
  return limpio;
}

/** La URL que se pide de verdad, con el slug del día ya sustituido. */
export function urlDeBarrido(api: ApiBarrida, slug: string | null): string {
  if (!api.query) return api.ruta;
  return `${api.ruta}?${api.query.replace("{slug}", slug ?? "")}`;
}
