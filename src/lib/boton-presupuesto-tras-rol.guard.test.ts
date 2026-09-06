import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ROLES_QUE_COTIZAN, puedeCotizar } from "@/lib/permisos-presupuesto";

/**
 * El botón «Crear presupuesto» no se le enseña a quien el servidor va a
 * rechazar.
 *
 * El test no lleva una lista de páginas ni de rutas: las descubre. Una
 * lista escrita a mano no se entera de la página nueva que alguien añada
 * el mes que viene, y ese es justo el fallo que esto vigila —el mismo que
 * ya me comí una vez repasando rutas a ojo.
 *
 * Vigila dos cosas:
 *   1. Que el componente compruebe el rol (una sola vez, dentro de él).
 *   2. Que los roles de `permisos-presupuesto` sigan siendo los que exige
 *      cada endpoint al que apunta el botón. Si mañana alguien cambia el
 *      `requireRole` de la ruta, aquí salta antes de que el panel enseñe
 *      una acción imposible.
 */

const RAIZ = path.resolve(__dirname, "..");
const COMPONENTE = path.join(RAIZ, "components/admin/CrearPresupuestoBoton.tsx");

function ficheros(dir: string, ext: string[]): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) salida.push(...ficheros(completo, ext));
    else if (ext.some((e) => nombre.endsWith(e))) salida.push(completo);
  }
  return salida;
}

/** Páginas que pintan el botón, con los endpoints a los que apunta cada una. */
function sitiosDeUso(): { fichero: string; endpoints: string[] }[] {
  const fuentes = ficheros(path.join(RAIZ, "app"), [".tsx"]);
  const sitios: { fichero: string; endpoints: string[] }[] = [];
  for (const f of fuentes) {
    const src = readFileSync(f, "utf8");
    if (!src.includes("<CrearPresupuestoBoton")) continue;
    const endpoints = [...src.matchAll(/endpoint=\{`([^`]+)`\}/g)].map((m) => m[1]);
    sitios.push({ fichero: path.relative(RAIZ, f), endpoints });
  }
  return sitios;
}

/** `/api/admin/quotes/${q.id}/presupuesto` → src/app/api/admin/quotes/[id]/presupuesto/route.ts */
function rutaDeEndpoint(endpoint: string): string {
  const limpio = endpoint.replace(/\$\{[^}]*\}/g, "[id]").replace(/^\//, "");
  return path.join(RAIZ, "app", limpio, "route.ts");
}

describe("el botón de crear presupuesto respeta el rol", () => {
  it("hay al menos un sitio que lo pinta (si no, el test no vigila nada)", () => {
    expect(sitiosDeUso().length).toBeGreaterThan(0);
  });

  it("el componente consulta el rol antes de pintarse", () => {
    const src = readFileSync(COMPONENTE, "utf8");
    expect(src).toMatch(/puedeCotizar/);
    expect(src).toMatch(/\/api\/admin\/auth\/me/);
    // Sin este `return null` el botón se pinta igualmente.
    expect(src).toMatch(/if\s*\(!permitido\)\s*return null/);
  });

  it("cada endpoint al que apunta exige exactamente los roles que declaramos", () => {
    const sitios = sitiosDeUso();
    const endpoints = [...new Set(sitios.flatMap((s) => s.endpoints))];
    expect(endpoints.length).toBeGreaterThan(0);

    for (const endpoint of endpoints) {
      const ruta = rutaDeEndpoint(endpoint);
      const src = readFileSync(ruta, "utf8");

      const m = src.match(/requireRole\(\s*\w+\s*,\s*([^)]+)\)/);
      expect(m, `${endpoint} ya no llama a requireRole — ¿se ha quitado la puerta?`).toBeTruthy();

      const exigidos = m![1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

      // CEO nunca aparece en la llamada: `requireRole` lo deja pasar siempre.
      for (const rol of exigidos) {
        expect(
          puedeCotizar(rol),
          `${endpoint} acepta ${rol} pero el botón se lo esconde`,
        ).toBe(true);
      }
      for (const rol of ROLES_QUE_COTIZAN) {
        if (rol === "CEO") continue;
        expect(
          exigidos.includes(rol),
          `el botón se enseña a ${rol} pero ${endpoint} no lo acepta`,
        ).toBe(true);
      }
    }
  });
});
