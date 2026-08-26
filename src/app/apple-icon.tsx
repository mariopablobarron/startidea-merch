import { brandIcon } from "@/lib/brand-icon";

/**
 * Icono para «Añadir a pantalla de inicio» en iOS.
 *
 * Medido el 26-ago-2026: `/apple-touch-icon.png` devolvía 404 y el HTML no
 * declaraba ningún `apple-touch-icon`. iOS, sin él, guarda una captura reducida
 * de la página como icono — el sitio quedaba en la pantalla de inicio como un
 * recorte borroso en vez de como la marca. El `icon.svg` no cubre este caso:
 * iOS no acepta SVG para el icono de pantalla de inicio.
 *
 * El dibujo vive en `@/lib/brand-icon`, compartido con los iconos PNG del
 * manifest: tres copias del mismo logo en tres ficheros se desincronizan a la
 * primera vez que cambie la marca.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return brandIcon(size.width);
}
