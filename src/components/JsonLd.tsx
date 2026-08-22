export function serializeJsonLd(data: Record<string, unknown> | Record<string, unknown>[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // `<` debe serializarse como escape Unicode: dentro de un elemento
      // script, `</script>` cierra la etiqueta aunque aparezca en un string
      // JSON. U+2028/U+2029 se escapan por compatibilidad con parsers JS.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
