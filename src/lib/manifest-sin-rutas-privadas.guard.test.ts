import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: el `manifest.json` no puede anunciar una ruta que
 * el middleware protege con sesión.
 *
 * Nació de esto: el manifest publicaba un acceso directo **«Admin — Panel
 * general (sólo equipo)» a `/admin`**, en un fichero público que sirve
 * cualquier visitante y que además acaba en el menú contextual del icono para
 * quien instale la PWA. No es una fuga de credenciales ni de proveedor —
 * `/admin` redirige a login—, pero publicita la puerta y su descripción
 * confirma para qué sirve.
 *
 * No se comprueba contra la lista «/admin y /clientes» escrita a mano: se lee
 * el `matcher` del propio `src/middleware.ts`, que es quien decide de verdad
 * qué está detrás de sesión. Si mañana se protege `/proveedores`, este guard
 * pasa a vigilarlo sin que nadie lo actualice.
 */

const RAIZ = process.cwd();

/** Prefijos que el middleware exige sesión, leídos de su `matcher`. */
export function rutasProtegidas(fuenteMiddleware: string): string[] {
  const m = fuenteMiddleware.match(/matcher:\s*\[([^\]]*)\]/s);
  if (!m) return [];
  return [...m[1].matchAll(/["'`](\/[^"'`]*)["'`]/g)]
    .map((x) => x[1].replace(/\/:path\*$/, "").replace(/\/\*$/, ""))
    .filter((x) => x.length > 1);
}

/** Rutas que el manifest anuncia: `start_url` y cada `shortcuts[].url`. */
export function rutasDelManifest(manifest: string): string[] {
  const d = JSON.parse(manifest) as {
    start_url?: string;
    shortcuts?: { url?: string }[];
  };
  const urls = [d.start_url, ...(d.shortcuts || []).map((s) => s.url)];
  return urls.filter((u): u is string => typeof u === "string");
}

describe("el manifest no publicita rutas que exigen sesión", () => {
  const manifest = readFileSync(join(RAIZ, "public/manifest.json"), "utf8");
  const middleware = readFileSync(join(RAIZ, "src/middleware.ts"), "utf8");
  const protegidas = rutasProtegidas(middleware);

  it("el matcher del middleware se lee de verdad", () => {
    // Si esto cae a cero, el guard estaría absolviendo por no encontrar nada
    // que comparar, que es la forma más silenciosa de no vigilar.
    expect(protegidas.length).toBeGreaterThanOrEqual(2);
    expect(protegidas).toContain("/admin");
  });

  it("ninguna ruta anunciada cae bajo un prefijo protegido", () => {
    const anunciadas = rutasDelManifest(manifest);
    expect(anunciadas.length).toBeGreaterThan(0);

    const publicitadas = anunciadas.filter((url) =>
      protegidas.some((p) => url === p || url.startsWith(p + "/")),
    );
    expect(publicitadas).toEqual([]);
  });

  it("el detector distingue la ruta protegida de la que solo se le parece", () => {
    const fake = JSON.stringify({
      start_url: "/",
      shortcuts: [
        { url: "/catalogo" },
        { url: "/administracion-de-fincas" }, // empieza igual, NO es /admin
        { url: "/admin" },
      ],
    });
    const anunciadas = rutasDelManifest(fake);
    const publicitadas = anunciadas.filter((url) =>
      ["/admin"].some((p) => url === p || url.startsWith(p + "/")),
    );
    expect(publicitadas).toEqual(["/admin"]);
  });

  it("lee los prefijos aunque el matcher cambie de forma", () => {
    expect(rutasProtegidas('matcher: ["/admin/:path*", "/clientes/:path*"]')).toEqual([
      "/admin",
      "/clientes",
    ]);
    expect(rutasProtegidas('matcher: ["/equipo/*"]')).toEqual(["/equipo"]);
    expect(rutasProtegidas("sin matcher aquí")).toEqual([]);
  });
});
