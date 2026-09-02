/**
 * Serializa datos para un `<script type="application/ld+json">`.
 *
 * `JSON.stringify` NO escapa `</script>`: un dato editorial que contenga esa
 * secuencia cierra la etiqueta y lo que venga detrás se ejecuta como HTML. El
 * comentario que había aquí ("ld+json no requiere escapes adicionales si el
 * contenido es seguro") daba por seguro justo lo que no lo es: el JSON-LD del
 * catálogo se arma con nombres y descripciones de producto que vienen de feeds
 * de proveedor y del panel, no de código.
 *
 * React no escapa nada dentro de `dangerouslySetInnerHTML`, así que el escape
 * tiene que ser explícito:
 *  - `<` se escapa como \\u003c, que rompe `</script>` sin cambiar el valor.
 *  - U+2028 / U+2029 son saltos de línea válidos en JS pero ilegales dentro de
 *    un literal de string: sin escapar, revientan el parser de algunos motores.
 *
 * El JSON resultante sigue siendo equivalente: `JSON.parse` devuelve el objeto
 * original, tal cual.
 */
export function serializeJsonLd(data: Record<string, unknown> | Record<string, unknown>[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}
