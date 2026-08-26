import { brandIcon } from "@/lib/brand-icon";

/**
 * Icono PNG de 192×192 para el `manifest.json`.
 *
 * El manifest solo declaraba `icon.svg` con `sizes="any"`. Chrome acepta SVG
 * en el manifest desde hace años, así que la premisa del backlog —«el sitio no
 * es instalable en Android»— nunca se llegó a confirmar: se intentó medir el
 * 26-ago-2026 con `beforeinstallprompt` y **el resultado no fue concluyente**
 * (el listener se registra después de que el evento pueda haberse disparado, y
 * un negativo ahí no prueba nada).
 *
 * Se añaden los PNG igualmente, y conviene ser honesto sobre por qué: no
 * porque se haya demostrado el fallo, sino porque 192 y 512 son el criterio
 * que Chrome documenta explícitamente, cuestan dos rutas derivadas del mismo
 * dibujo de marca, y así la duda deja de arrastrarse de run en run. El SVG
 * sigue declarado el primero para las pantallas que lo prefieran.
 */
export const runtime = "nodejs";

export function GET() {
  return brandIcon(192);
}
