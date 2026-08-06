import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard estático: ningún secreto puede caer a un literal escrito en el código.
 *
 * Por qué existe: el 6-ago se encontraron TRES sitios con el mismo patrón
 * —`proposal-token`, `dashboard-share` y `/api/media`— y en dos de ellos el
 * literal estaba vivo en producción, porque las envs no existían. Este
 * repositorio es PÚBLICO, así que ese literal es un secreto que puede leer
 * cualquiera: con el de `dashboard-share` se abría el dashboard entero
 * (verificado contra producción: HTTP 200), sin necesidad de adivinar nada.
 *
 * Lo que se prohíbe es el atajo `process.env.X ?? "literal"`. La forma
 * correcta es `resolveSigningSecret()`, que en producción devuelve null y
 * obliga a fallar cerrado. Un `?? ""` sigue permitido: la cadena vacía se
 * trata como ausencia en todo el repo.
 */

const RAIZ = "src";

/** Envs cuyo nombre delata que son credenciales. */
const NOMBRE_DE_SECRETO = "[A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD)[A-Z0-9_]*";

/**
 * `process.env.ALGO_SECRET ?? (process.env.OTRO ??)* "literal no vacío"`.
 * Se aplica sobre el fichero con los saltos de línea colapsados porque el
 * caso real venía repartido en cuatro líneas y una regex por líneas no lo
 * habría visto.
 */
const FALLBACK_A_LITERAL = new RegExp(
  `process\\.env\\.(${NOMBRE_DE_SECRETO})\\s*(?:\\?\\?|\\|\\|)\\s*` +
    `(?:process\\.env\\.[A-Z0-9_]+\\s*(?:\\?\\?|\\|\\|)\\s*)*` +
    `(["'\`])([^"'\`]+)\\2`,
  "g",
);

const MENCIONA_ENV_SECRETA = new RegExp(`process\\.env\\.${NOMBRE_DE_SECRETO}`);

function ficherosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) ficherosDeCodigo(ruta, acc);
    else if (/\.tsx?$/.test(ruta) && !/\.test\.tsx?$/.test(ruta)) acc.push(ruta);
  }
  return acc;
}

const ficheros = ficherosDeCodigo(RAIZ);

/** Colapsa saltos de línea para que las cadenas multilínea no se escapen. */
const enUnaLinea = (texto: string) => texto.replace(/\s*\n\s*/g, " ");

describe("guard · ningún secreto cae a un literal del código", () => {
  it("ningún fichero usa `process.env.X_SECRET ?? \"literal\"`", () => {
    const hallazgos: string[] = [];

    for (const fichero of ficheros) {
      const texto = enUnaLinea(readFileSync(fichero, "utf8"));
      for (const m of texto.matchAll(FALLBACK_A_LITERAL)) {
        hallazgos.push(`${fichero} → ${m[1]} cae a "${m[3]}"`);
      }
    }

    expect(
      hallazgos,
      "Un secreto no puede tener por defecto algo que está escrito en un repo " +
        "público. Usa resolveSigningSecret() de src/lib/signing-secret.ts, que " +
        "en producción devuelve null y te obliga a fallar cerrado:\n" +
        hallazgos.join("\n"),
    ).toEqual([]);
  });

  /**
   * Un guard que deja de encontrar sitios pasa en verde para siempre: es el
   * modo de fallo silencioso de todo guard estático. Los otros cinco del repo
   * llevan esta misma comprobación.
   */
  it("el guard sigue mirando código de verdad (cobertura propia)", () => {
    expect(ficheros.length).toBeGreaterThan(300);

    const conEnvSecreta = ficheros.filter((f) =>
      MENCIONA_ENV_SECRETA.test(readFileSync(f, "utf8")),
    );
    // Había 63 al escribirlo; si esto baja de golpe es que el barrido dejó de
    // encontrar el código, no que el repo se haya limpiado.
    expect(conEnvSecreta.length).toBeGreaterThanOrEqual(20);
  });

  it("la regex caza de verdad el patrón que motivó el guard (anti-falso-verde)", () => {
    // Los tres casos reales, tal y como estaban escritos, incluido el
    // multilínea que una regex por líneas no habría detectado.
    const casosReales = [
      `const SECRET = process.env.MEDIA_PROXY_SECRET || process.env.ADMIN_SECRET || "fallback";`,
      `const SECRET =\n  process.env.DASHBOARD_SHARE_SECRET ??\n  process.env.NEXTAUTH_SECRET ??\n  "dev-share-secret-do-not-use-in-prod";`,
      `const SECRET =\n  process.env.PROPOSAL_SIGN_SECRET ??\n  process.env.NEXTAUTH_SECRET ??\n  "dev-only-proposal-secret-do-not-use-in-prod";`,
    ];
    for (const caso of casosReales) {
      expect([...enUnaLinea(caso).matchAll(FALLBACK_A_LITERAL)]).toHaveLength(1);
    }

    // Y no se pasa de frenada con lo que sí es legítimo.
    const permitidos = [
      `const s = process.env.ADMIN_SECRET || "";`,
      `const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";`,
      `const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";`,
      `candidates: [process.env.DASHBOARD_SHARE_SECRET, process.env.ADMIN_SECRET],`,
    ];
    for (const caso of permitidos) {
      expect([...enUnaLinea(caso).matchAll(FALLBACK_A_LITERAL)]).toHaveLength(0);
    }
  });
});
