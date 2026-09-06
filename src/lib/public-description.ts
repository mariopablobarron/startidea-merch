import { legacyHtmlToText } from "./product-name";
import { sanitizeSupplierText } from "./suppliers/sanitize-supplier-text";

/**
 * FRONTERA DE SALIDA para el texto descriptivo que viene del proveedor.
 *
 * El saneador de `sanitize-supplier-text.ts` se aplica en la ENTRADA —los sync
 * y el import de Ádivin—, y su guard vigila el seed que alimenta al importador.
 * Las dos cosas son ciertas y las dos estaban verdes el 06-sep-2026 mientras
 * producción publicaba, en 59 fichas ACTIVAS, la frase del catálogo mayorista:
 *
 *   «… ✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online
 *     ✓ Fabricación y entrega en 24h【30% de margen】Envío gratis.»
 *
 * Nadie se saltó nada: esas filas entraron ANTES de que existiera el saneador,
 * el proveedor es de import MANUAL y por tanto nada las ha vuelto a tocar. Un
 * saneo que solo mira la entrada no alcanza a lo que ya está guardado, y el
 * guard del seed no puede verlo porque el seed sí está limpio.
 *
 * De ahí esta frontera: el texto de proveedor se sanea también AL SALIR, así
 * que deja de depender de que alguien reimporte. No toca la base de datos —es
 * reversible quitando la llamada— y es la misma vía que ya usan `publicRef` y
 * `publicBrand` para los identificadores.
 *
 * NO se aplica a lo que escribe Startidea en el panel (`customDescription`,
 * `metaDescription`): eso no es texto de proveedor y el saneador dice
 * explícitamente que no debe pasar por él. Si un día Startidea quiere prometer
 * envío gratis, lo escribe en un override y llega intacto.
 */
export function descripcionPublica(value: string | null | undefined): string {
  return sanitizeSupplierText(value) ?? "";
}

/**
 * Igual que `descripcionPublica` pero conservando el `null`, para las salidas
 * JSON donde el campo debe desaparecer en vez de viajar como cadena vacía.
 */
export function descripcionPublicaONull(value: string | null | undefined): string | null {
  return sanitizeSupplierText(value);
}

/** Reexportado para las superficies que aún necesitan solo quitar el HTML. */
export { legacyHtmlToText };
