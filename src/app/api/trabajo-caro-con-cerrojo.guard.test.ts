import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guard POR DESCUBRIMIENTO — busca el TRABAJO CARO, no una lista de rutas.
 *
 * El modo de fallo que vigila ya ha tirado este VPS dos veces: una ruta pública
 * que retiene el proceso y varios GB de RAM por petición no se protege con
 * `rateLimit`, porque ese cuenta POR IP — N IPs pidiendo una vez cada una
 * apilan N trabajos simultáneos igual. El tope que salva ahí es el GLOBAL
 * (`acquireInFlight`).
 *
 * Por qué descubriendo y no con una lista blanca: una lista solo demostraría
 * que no ha vuelto lo viejo. Lo que hay que impedir es lo PRÓXIMO — que alguien
 * añada mañana otra ruta pública que renderice un PDF o decodifique imágenes
 * sin tope global, que es exactamente como llegaron aquí las tres que se
 * encontraron el 06-sep-2026. Así que se descubre por la señal del coste
 * (`renderToBuffer`, `sharp`) y se exige el cerrojo, o una excepción escrita.
 *
 * Las rutas tras un gate (admin, cron, token HMAC) quedan fuera: ahí no hay
 * público que pueda apilar peticiones.
 */

const API = join(process.cwd(), "src", "app", "api");

/** Señales de que el handler hace trabajo caro dentro del proceso. */
const TRABAJO_CARO = [/\brenderToBuffer\b/, /from ["']sharp["']/];

/** Prefijos que no son superficie pública (ver `public-api-surfaces.ts`). */
const NO_PUBLICAS = ["admin", "cron", "clientes"];

/** Gates que hacen que la ruta no sea alcanzable sin credencial. */
const GATES = [/verifyProposalToken\(/, /requireCronSecret\(/, /authenticateAdminRequest\(/];

/**
 * Excepciones DECLARADAS, con motivo. Como en `public-api-surfaces.ts`: la
 * salida es declarar, no elegir en silencio. Una ruta cara nueva suspende el
 * guard hasta que alguien decida qué hacer con ella.
 */
const SIN_CERROJO_A_PROPOSITO: Record<string, string> = {
  "proposal/send/route.ts":
    "El sitio limpio para el cerrojo está DESPUÉS de reservar el número de propuesta, y devolver 503 ahí deja un hueco en la numeración comercial. Ponerlo antes exige extraer un cuerpo que envía emails reales. Acotada mientras tanto por rateLimit 5/10 min por IP, y su PDF es mucho más barato que los otros dos. Escalado a Mario el 06-sep-2026.",
};

function rutas(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...rutas(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const caras = rutas(API)
  .map((f) => ({ rel: relative(API, f).split(sep).join("/"), src: readFileSync(f, "utf8") }))
  .filter(({ rel }) => !NO_PUBLICAS.includes(rel.split("/")[0]))
  .filter(({ src }) => TRABAJO_CARO.some((re) => re.test(src)))
  .filter(({ src }) => !GATES.some((re) => re.test(src)));

describe("guard: toda ruta pública con trabajo caro tiene tope GLOBAL", () => {
  it("hay al menos una ruta cara descubierta (si no, el guard no vigila nada)", () => {
    expect(caras.length).toBeGreaterThan(0);
  });

  it.each(caras.map(({ rel }) => rel))("%s tiene acquireInFlight o excepción escrita", (rel) => {
    const { src } = caras.find((c) => c.rel === rel)!;
    if (SIN_CERROJO_A_PROPOSITO[rel]) {
      expect(SIN_CERROJO_A_PROPOSITO[rel].length).toBeGreaterThan(80);
      return;
    }
    expect(
      src,
      `${rel} hace trabajo caro sin tope global. Añade acquireInFlight (y libéralo en finally) o declara la excepción con motivo en este guard.`,
    ).toMatch(/acquireInFlight\(/);
  });

  it("las excepciones declaradas siguen existiendo (si no, sobra la entrada)", () => {
    for (const rel of Object.keys(SIN_CERROJO_A_PROPOSITO)) {
      expect(caras.some((c) => c.rel === rel), `${rel} ya no es una ruta cara pública`).toBe(true);
    }
  });
});
