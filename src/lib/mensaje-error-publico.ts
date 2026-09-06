import { findSupplierLeak } from "./supplier-leak-terms";

/**
 * Frontera de salida para los mensajes de excepción que se devuelven a un
 * cliente público: si el texto delata a un proveedor, no sale.
 *
 * POR QUÉ EXISTE, con la medición delante (05-sep). `/api/mockup/generate`
 * resuelve el hash del proxy a `MediaAsset.originalUrl` —la URL real del CDN
 * del proveedor— para poder descargar la imagen base desde el contenedor, y
 * el `catch` del `fetch` devolvía `e.message` tal cual en un 502 público.
 * `fetch` de Node tiene un mensaje que SÍ lleva la URL entera dentro:
 *
 *     fetch("cdn1.midocean.com/x.jpg")
 *       → TypeError: Failed to parse URL from cdn1.midocean.com/x.jpg
 *
 * (comprobado en Node 22; el caso normal, el host que no resuelve, se queda
 * en un escueto "fetch failed" que no delata nada).
 *
 * HOY ESO NO ES ALCANZABLE, y conviene decirlo sin adornos para que nadie
 * lea esto como el parte de una fuga: para llegar al mensaje malo haría falta
 * una URL guardada sin esquema, y no la hay. Medido en producción el 05-sep:
 * 82.236 filas de `MediaAsset`, **0** sin `https?://`; 9.759 productos activos
 * y 21.022 `MarkingPosition`, **0** con host de proveedor en claro y **0**
 * malformadas. `ensureMediaAsset` solo escribe si `new URL(...)` parsea.
 *
 * Lo que sí justifica la frontera es que esa garantía vive repartida en tres
 * sitios que no se conocen entre sí —la validación al escribir, el
 * proxificado del sync y este `catch`—, y la regla nº2 («el cliente nunca
 * sabe de quién compramos») no debería depender de que los tres sigan
 * alineados. Aquí el invariante es local: se comprueba el texto justo antes
 * de emitirlo, que es lo único que el cliente llega a ver.
 *
 * @param e        lo capturado en el `catch`.
 * @param generico lo que se emite cuando el mensaje real delata (o no es un
 *                 Error). Debe describir la operación, nunca su destino.
 */
export function mensajeErrorPublico(e: unknown, generico = "error de red"): string {
  const mensaje = e instanceof Error ? e.message : "";
  if (!mensaje) return generico;
  return findSupplierLeak(mensaje) ? generico : mensaje;
}
