import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

/**
 * SEO editable por página desde /admin/marketing/seo. Cada página server-side
 * puede llamar a getPageSeo(path) en su generateMetadata() y mergear sobre
 * sus defaults hardcoded. Si no hay row en BD, devuelve null.
 *
 * Diseño: path como id (no slug ni id sintético) — lookups O(1) y URL ↔ row
 * directo en admin.
 */

export type PageSeoData = {
  path: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  robots: string | null;
  schemaJson: unknown | null;
  updatedAt: Date;
  updatedBy: string | null;
};

export const SEO_PATHS = [
  { path: "/", label: "Home" },
  { path: "/catalogo", label: "Catálogo (listado)" },
  { path: "/recomendador", label: "Recomendador IA" },
  { path: "/cotizar", label: "Cotizar" },
  { path: "/sobre", label: "Sobre" },
  { path: "/ayuda", label: "Ayuda" },
  { path: "/clientes", label: "Portal cliente (login)" },
  { path: "/sectores", label: "Por sectores" },
  { path: "/privacidad", label: "Privacidad" },
  { path: "/aviso-legal", label: "Aviso legal" },
] as const;

/**
 * Lee SEO override desde BD. Tolerante a fallos (devuelve null si DB caída).
 */
export async function getPageSeo(path: string): Promise<PageSeoData | null> {
  try {
    const row = await prisma.pageSeo.findUnique({ where: { path } });
    return row;
  } catch {
    return null;
  }
}

/**
 * Aplica el override sobre un Metadata base. Solo sobreescribe campos
 * presentes — los del default permanecen para los que el admin no tocó.
 */
export function mergeMetadata(
  base: Metadata,
  override: PageSeoData | null,
): Metadata {
  const result: Metadata = { ...base };

  // Nunca devolver la referencia compartida del metadata base. Algunas rutas
  // ajustan después campos según la petición (por ejemplo, el canonical de
  // /catalogo?cat=...) y mutarían el objeto de módulo para futuras peticiones.
  if (!override) return withCanonicalOgUrl(result);

  if (override.title) result.title = override.title;
  if (override.description) result.description = override.description;

  // OpenGraph hereda de title/description si no se especifica
  result.openGraph = {
    ...(base.openGraph || {}),
    ...(override.title ? { title: override.title } : {}),
    ...(override.description ? { description: override.description } : {}),
    ...(override.ogImage ? { images: [{ url: override.ogImage }] } : {}),
  };

  if (override.robots) {
    result.robots = override.robots;
  }

  return withCanonicalOgUrl(result);
}

/**
 * `og:url` coherente con el canonical de la propia página.
 *
 * Medido en producción el 25-ago-2026: 10 de 12 páginas medidas decían a las
 * redes que la URL compartida era la home, porque heredaban el `openGraph.url`
 * del layout raíz. Compartir /catalogo o /sectores en LinkedIn o WhatsApp daba
 * una tarjeta que apuntaba a la home, y las señales sociales se consolidaban
 * ahí en vez de en la página compartida.
 *
 * Es el mismo error que ya se corrigió con `alternates.canonical` global (ver
 * el comentario en `src/app/layout.tsx`): un valor de página puesto en el
 * layout no es un default, es una afirmación falsa sobre cada página que no lo
 * sobrescriba. Aquí la url se deriva del canonical, que cada página sí declara.
 *
 * No pisa un `openGraph.url` explícito: quien ya lo declara manda.
 */
export function withCanonicalOgUrl(metadata: Metadata): Metadata {
  const canonical = metadata.alternates?.canonical;
  if (!canonical) return metadata;
  if (metadata.openGraph && "url" in metadata.openGraph && metadata.openGraph.url) {
    return metadata;
  }

  // El canonical puede ser string, URL o `{ url }` (Next admite las tres).
  const url =
    typeof canonical === "string"
      ? canonical
      : canonical instanceof URL
        ? canonical.toString()
        : typeof canonical === "object" && canonical !== null && "url" in canonical
          ? String((canonical as { url: string | URL }).url)
          : null;
  if (!url) return metadata;

  return { ...metadata, openGraph: { ...(metadata.openGraph ?? {}), url } };
}
