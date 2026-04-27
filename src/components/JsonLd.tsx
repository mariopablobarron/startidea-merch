export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Stringify deterministic; ld+json no requiere escapes adicionales si el contenido es seguro
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
