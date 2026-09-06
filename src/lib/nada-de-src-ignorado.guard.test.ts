import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD: ningún archivo de `src/` puede estar en el `.gitignore`.
 *
 * El 1-sep-2026 el endpoint `src/app/api/admin/uploads/presupuesto/route.ts` se
 * quedó sin commitear y nadie se enteró: la regla `uploads/` del `.gitignore`
 * —pensada para la carpeta de subidas del VPS— ignora **cualquier** carpeta con
 * ese nombre a cualquier profundidad, incluida la de los endpoints de subida.
 *
 * Es el peor tipo de fallo: `git status` no enseña el archivo, el build local
 * pasa (compila desde el disco, no desde git) y el despliegue sale sin la ruta.
 * El botón «Subir imagen» habría dado 404 en producción.
 *
 * Se arregló anclando la regla con barra inicial (`/uploads/`). Este test es la
 * red para la próxima regla demasiado ancha.
 */

const RAIZ = join(__dirname, "..", "..");

function ficheros(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) ficheros(ruta, acc);
    else acc.push(ruta.slice(RAIZ.length + 1));
  }
  return acc;
}

/**
 * `git check-ignore` devuelve las rutas ignoradas y sale con 1 si no hay ninguna.
 *
 * `--no-index` es lo que hace que esto siga sirviendo: sin él, git calla sobre
 * los archivos que YA están versionados, y el guard se volvería ciego justo
 * después de commitear el archivo que se salvó. Lo que se quiere saber es si la
 * regla se comería código de `src/`, no si el daño ya está hecho.
 */
function ignorados(rutas: string[]): string[] {
  try {
    const salida = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: RAIZ,
      input: rutas.join("\n"),
      encoding: "utf8",
    });
    return salida.split("\n").filter(Boolean);
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    // status 1 = ninguna ruta ignorada, que es lo que queremos.
    if (err.status === 1) return [];
    if (err.status === 0 && err.stdout) return err.stdout.split("\n").filter(Boolean);
    throw e;
  }
}

describe("guard · el .gitignore no se come código de src/", () => {
  const rutas = ficheros(join(RAIZ, "src"));

  it("el guard ve el árbol de verdad (anti-falso-verde)", () => {
    expect(rutas.length).toBeGreaterThan(300);
  });

  it("ningún archivo de src/ está ignorado", () => {
    const fuera = ignorados(rutas);
    expect(
      fuera,
      `Estos archivos de src/ NO llegarían a un checkout limpio:\n${fuera.join("\n")}\n` +
        `Ancla la regla del .gitignore con barra inicial (p. ej. /uploads/ en vez de uploads/).`,
    ).toEqual([]);
  });
});
