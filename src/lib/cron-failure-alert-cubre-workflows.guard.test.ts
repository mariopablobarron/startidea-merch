import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD: ningún cron programado se queda sin aviso cuando falla.
 *
 * El 27-ago-2026 el `Cron watchdog diario` falló a las 20:51 UTC porque el
 * runner no pudo abrir conexión con la VPS (`curl (28)`, tres intentos). Nadie
 * se enteró: un workflow que muere antes de llegar al servidor no deja rastro
 * en `wrapCronHandler` —que solo ve lo que entra— y su casilla roja en la
 * pestaña Actions no la mira nadie. `cron-failure-alert.yml` existe para cerrar
 * ese hueco desde el runner, que es el único sitio desde el que se puede avisar
 * de que la VPS no responde.
 *
 * Pero ese workflow se apoya en una LISTA de nombres, y una lista blanca solo
 * demuestra que no se ha caído lo viejo: el primer cron nuevo que alguien añada
 * nace sin vigilancia y reproduce exactamente el silencio de aquel día. Por eso
 * este guard no comprueba la lista contra otra lista: recorre los workflows de
 * verdad, se queda con los que tienen `schedule:` y suspende si alguno falta.
 *
 * Excluir uno es una decisión legítima (un workflow ruidoso que falla por
 * umbrales, no por avería), pero tiene que ser CONSCIENTE: se añade a
 * `EXCLUIDOS_A_PROPOSITO` con su motivo, y así se lee en la revisión en vez de
 * desaparecer.
 */

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const VIGILANTE = "cron-failure-alert.yml";

/** Programados que a propósito NO avisan al fallar. Motivo obligatorio. */
const EXCLUIDOS_A_PROPOSITO: Record<string, string> = {
  // (vacío a propósito: hoy se vigilan todos. El problema era la ceguera,
  //  no el exceso de ruido — si alguno resulta ruidoso, se excluye AQUÍ.)
};

function nombreDe(src: string): string | null {
  return /^name:\s*(.+?)\s*$/m.exec(src)?.[1] ?? null;
}

function tieneSchedule(src: string): boolean {
  return /^\s*-\s*cron:\s*["']/m.test(src);
}

function ficheros(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml"));
}

function programados(): { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const file of ficheros()) {
    if (file === VIGILANTE) continue; // no se vigila a sí mismo, a sabiendas
    const src = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    if (!tieneSchedule(src)) continue;
    const name = nombreDe(src);
    if (!name) continue;
    out.push({ file, name });
  }
  return out;
}

/** Los nombres del bloque `workflows:` del vigilante, tal cual están escritos. */
function vigilados(): string[] {
  const src = readFileSync(join(WORKFLOWS_DIR, VIGILANTE), "utf8");
  const bloque = /^\s*workflows:\s*$([\s\S]*?)^\S/m.exec(src + "\npermissions")?.[1];
  if (!bloque) return [];
  return [...bloque.matchAll(/^\s*-\s*["'](.+?)["']\s*$/gm)].map((m) => m[1]);
}

describe("cron-failure-alert cubre todos los workflows programados", () => {
  const lista = programados();
  const cubiertos = vigilados();

  it("encuentra workflows programados (si esto falla, el guard se quedó ciego)", () => {
    expect(lista.length).toBeGreaterThanOrEqual(10);
  });

  it("el vigilante declara una lista no vacía (si no, no vigila nada)", () => {
    expect(cubiertos.length).toBeGreaterThanOrEqual(10);
  });

  it.each(lista)("$name ($file) tiene aviso al fallar", ({ name, file }) => {
    if (EXCLUIDOS_A_PROPOSITO[name]) return;
    expect(
      cubiertos,
      `"${name}" (${file}) tiene schedule pero no está en el bloque ` +
        `workflows: de ${VIGILANTE}. Si falla, nadie se entera — que es ` +
        `exactamente lo que pasó el 27-ago con el watchdog. Añádelo, o ` +
        `justifícalo en EXCLUIDOS_A_PROPOSITO de este guard.`,
    ).toContain(name);
  });

  it("no vigila nombres que ya no existen (lista sin muertos)", () => {
    const existentes = new Set(
      ficheros().map((f) => nombreDe(readFileSync(join(WORKFLOWS_DIR, f), "utf8"))),
    );
    for (const n of cubiertos) {
      expect(
        existentes,
        `${VIGILANTE} vigila "${n}", que ya no es el name de ningún workflow. ` +
          `Un nombre que no casa NO avisa de nada y aparenta cobertura.`,
      ).toContain(n);
    }
  });

  it("el vigilante no se lista a sí mismo (workflow_run recursivo)", () => {
    const propio = nombreDe(readFileSync(join(WORKFLOWS_DIR, VIGILANTE), "utf8"));
    expect(cubiertos).not.toContain(propio);
  });
});
