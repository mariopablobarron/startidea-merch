import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BodySchema } from "@/lib/proposal-send-schema";
import { SUPPLIER_DOMAINS, urlDelataProveedor } from "@/lib/supplier-leak-terms";

/**
 * POST /api/proposal/send es PÚBLICA (sin sesión, solo rate limit por IP): el
 * cuerpo entero lo controla quien llama, y `quoteItems` se persiste tal cual en
 * una columna JSON. El 24-ago-2026 se midió qué hay realmente guardado: 12
 * propuestas, y UNA del 25-jun con `cdn1.midocean.com` en `primaryImageUrl` —
 * residuo anterior al arreglo del incidente del 20-jul, cuando las imágenes
 * pasaron a servirse por `/api/m/<hash>`.
 *
 * Hoy ninguna salida al cliente pinta esas URLs (el PDF no las usa y el email
 * ni recibe los items), así que NO hay fuga abierta. Lo que faltaba era el
 * cerrojo de entrada: que la puerta pública no pueda volver a guardar una URL
 * que delate al proveedor.
 */
describe("las URLs de una propuesta pública no pueden delatar al proveedor", () => {
  const item = (product: Record<string, unknown>) => ({
    email: "cliente@ejemplo.es",
    quoteItems: [
      {
        description: "Taza cerámica",
        notFound: false,
        quantity: 100,
        technique: null,
        colorRequested: null,
        unitPriceCents: 250,
        totalCents: 25000,
        priceSource: "tier" as const,
        product: { slug: "taza", name: "Taza", ref: "STM-001", ...product },
      },
    ],
  });

  const parsear = (product: Record<string, unknown>) => {
    const r = BodySchema.safeParse(item(product));
    if (!r.success) throw new Error(`no debería rechazar: ${r.error.message}`);
    return r.data.quoteItems[0].product!;
  };

  it("sanea el CDN del proveedor en primaryImageUrl, sin rechazar la propuesta", () => {
    const p = parsear({
      url: "https://merchandising.startidea.es/catalogo/taza",
      primaryImageUrl: "https://cdn1.midocean.com/image/700X700/s11.jpg",
    });
    expect(p.primaryImageUrl).toBeNull();
    // …y no se lleva por delante el resto del item: sigue siendo una venta.
    expect(p.url).toBe("https://merchandising.startidea.es/catalogo/taza");
  });

  it("sanea también la url del producto si apunta al proveedor", () => {
    const p = parsear({
      url: "https://www.publicatalogue.com/producto/123",
      primaryImageUrl: null,
    });
    expect(p.url).toBe("");
  });

  it("deja intactas las URLs buenas: relativa /api/m/<hash> y dominio propio", () => {
    const p = parsear({
      url: "https://merchandising.startidea.es/catalogo/taza",
      primaryImageUrl: "/api/m/Q2X9F7K3M2P5R8N4",
    });
    expect(p.url).toBe("https://merchandising.startidea.es/catalogo/taza");
    expect(p.primaryImageUrl).toBe("/api/m/Q2X9F7K3M2P5R8N4");
  });

  it("no confunde un slug legítimo que contiene 'cifra' con el proveedor", () => {
    // `findSupplierLeak` marcaría esta cadena por el término de palabra
    // "cifra"; por eso el saneado mira el HOST y no la cadena entera.
    const p = parsear({
      url: "https://merchandising.startidea.es/catalogo/cifra-de-negocio",
      primaryImageUrl: null,
    });
    expect(p.url).toBe("https://merchandising.startidea.es/catalogo/cifra-de-negocio");
  });

  it("descarta lo que no es navegable (javascript:, data:, basura)", () => {
    for (const mala of ["javascript:alert(1)", "data:text/html,<script>x</script>", "no-es-una-url"]) {
      expect(urlDelataProveedor(mala)).toBe(true);
    }
  });

  /**
   * Guard POR DESCUBRIMIENTO: la lista de dominios no se comprueba contra sí
   * misma, sino contra la lista que `proxy-image.ts` ya considera de proveedor.
   * Si mañana alguien añade allí un CDN nuevo y no aquí, esto se pone rojo — que
   * es justo el fallo que un test escrito a mano dejaría pasar.
   */
  it("cubre todos los hosts que proxy-image considera de proveedor", () => {
    const fuente = readFileSync(join(process.cwd(), "src/lib/proxy-image.ts"), "utf8");
    const bloque = fuente.match(/const PROVIDER_HOSTS = new Set\(\[([\s\S]*?)\]\)/);
    expect(bloque, "PROVIDER_HOSTS cambió de forma en proxy-image.ts").not.toBeNull();
    const hosts = [...bloque![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(hosts.length).toBeGreaterThan(5); // el guard se vigila a sí mismo
    for (const host of hosts) {
      expect(urlDelataProveedor(`https://${host}/foto.jpg`), `host sin cubrir: ${host}`).toBe(true);
    }
  });

  it("la lista de dominios sigue viva (si se vacía, el guard sería vacuo)", () => {
    expect(SUPPLIER_DOMAINS.length).toBeGreaterThanOrEqual(6);
  });
});
