import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard: cada icono que el `manifest.json` declara tiene que existir de verdad.
 *
 * Un manifest que apunta a un PNG inexistente no da error en ningún sitio: el
 * navegador pide el fichero, recibe un 404 y deja de considerar la app
 * instalable, en silencio. Es el mismo silencio con el que
 * `/apple-touch-icon.png` estuvo devolviendo 404 mientras iOS guardaba
 * capturas borrosas como icono.
 *
 * Vale que el icono sea un fichero de `public/` o una ruta generada por el
 * App Router (`src/app/<ruta>/route.tsx`), que es como se sirven los PNG
 * dibujados desde el SVG de marca.
 */

const RAIZ = process.cwd();

export function iconosDeclarados(manifest: string): string[] {
  const d = JSON.parse(manifest) as { icons?: { src?: string }[] };
  return (d.icons || []).map((i) => i.src).filter((s): s is string => !!s);
}

export function existeComoRecurso(src: string): boolean {
  const limpio = src.split("?")[0].replace(/^\//, "");
  if (existsSync(join(RAIZ, "public", limpio))) return true;
  for (const ext of ["tsx", "ts"]) {
    if (existsSync(join(RAIZ, "src", "app", limpio, `route.${ext}`))) return true;
  }
  // `icon.svg` y compañía viven como convención del App Router.
  return existsSync(join(RAIZ, "src", "app", limpio));
}

describe("los iconos del manifest existen", () => {
  const manifest = readFileSync(join(RAIZ, "public/manifest.json"), "utf8");

  it("declara al menos un PNG de 192 y uno de 512", () => {
    const d = JSON.parse(manifest) as { icons?: { sizes?: string; type?: string }[] };
    const png = (d.icons || []).filter((i) => i.type === "image/png");
    expect(png.some((i) => i.sizes === "192x192")).toBe(true);
    expect(png.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("ninguno apunta a un recurso que no existe", () => {
    const rotos = iconosDeclarados(manifest).filter((src) => !existeComoRecurso(src));
    expect(rotos).toEqual([]);
  });

  it("el detector no absuelve una ruta inventada", () => {
    // Si `existeComoRecurso` devolviera siempre true, el test de arriba pasaría
    // en verde con el manifest apuntando a cualquier parte.
    expect(existeComoRecurso("/icon-no-existe-9999.png")).toBe(false);
    expect(existeComoRecurso("/manifest.json")).toBe(true);
  });
});
