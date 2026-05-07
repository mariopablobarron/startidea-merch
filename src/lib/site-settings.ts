import { prisma } from "@/lib/prisma";

/**
 * CMS de copy editable desde /admin/marketing/site.
 *
 * Cada setting es un par key/value JSON. Las páginas server-side leen
 * los settings al renderizar y caen al fallback hardcoded si no hay
 * valor en BD. Esto permite editar copy sin desplegar código.
 *
 * Para añadir un nuevo setting:
 *   1. Define el tipo en `SiteSettingsMap`
 *   2. Añade el fallback en `DEFAULT_SETTINGS`
 *   3. Lee con `getSiteSettings()` server-side donde lo necesites
 *   4. Añade el campo al form de /admin/marketing/site
 */

export type CtaLink = { label: string; href: string };

export type SiteSettingsMap = {
  "hero.badge": string;
  "hero.h1Prefix": string;
  "hero.h1Accent": string;
  "hero.subhead": string;
  "hero.ctaPrimary": CtaLink;
  "hero.ctaSecondary": CtaLink;
};

export const DEFAULT_SETTINGS: SiteSettingsMap = {
  "hero.badge": "Producción en Centros Especiales de Empleo",
  "hero.h1Prefix": "Merchandising corporativo personalizado",
  "hero.h1Accent": "desde {price} €/ud",
  "hero.subhead":
    "Camisetas, sudaderas, bolígrafos, mochilas, termos y +{count} productos más, con tu logo. Cotización en 24h. Producción que cambia vidas.",
  "hero.ctaPrimary": { label: "Ver catálogo →", href: "/catalogo" },
  "hero.ctaSecondary": { label: "Pedir cotización", href: "#cotizar" },
};

/**
 * Lee TODOS los settings y mergea con defaults. Devuelve el mapa tipado
 * con cualquier override que el admin haya guardado en BD.
 */
export async function getSiteSettings(): Promise<SiteSettingsMap> {
  try {
    const rows = await prisma.siteSetting.findMany();
    const overrides = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<SiteSettingsMap>;
    return { ...DEFAULT_SETTINGS, ...overrides };
  } catch {
    // Fallback en build time o si BD no disponible
    return DEFAULT_SETTINGS;
  }
}

/**
 * Sustituye placeholders {price} y {count} en strings de copy con valores dinámicos.
 */
export function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
