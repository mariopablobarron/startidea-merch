import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// El guard vive en scripts/ (corre en CI con node pelado, sin build). Se importa
// aquí porque su lógica de clasificación decide QUÉ se le dice a quien recibe la
// alerta de dinero, y eso merece test. El módulo está guardado con
// `import.meta.url === argv[1]`, así que importarlo NO toca la red.
import {
  classifyResults,
  buildAlertText,
  esFalloDeConexion,
  timeoutParaIntento,
  KIND_MONEY,
  KIND_AVAILABILITY,
  // @ts-expect-error — .mjs sin tipos, importado a propósito desde el test
} from "../../scripts/money-smoke-test.mjs";

const ok = (name: string) => ({ name, state: "ok", kind: KIND_MONEY, detail: "" });
const moneyFail = (name: string, detail = "") => ({ name, state: "fail", kind: KIND_MONEY, detail });
const availFail = (name: string, detail = "") => ({ name, state: "fail", kind: KIND_AVAILABILITY, detail });
const skip = (name: string, detail = "") => ({ name, state: "unchecked", kind: KIND_AVAILABILITY, detail });

describe("classifyResults — de qué se avisa exactamente", () => {
  it("todo verde: sin severidad", () => {
    const c = classifyResults([ok("precio base > 0"), ok("sin proveedor en GET /catalogo/taza")]);
    expect(c.severity).toBeNull();
    expect(c.oks).toHaveLength(2);
  });

  it("una fuga de proveedor es severidad DINERO", () => {
    const c = classifyResults([ok("precio base > 0"), moneyFail("sin proveedor en GET /catalogo/taza", 'contiene "midocean"')]);
    expect(c.severity).toBe(KIND_MONEY);
    expect(c.moneyFails).toHaveLength(1);
  });

  it("el marcaje que deja de cobrarse es severidad DINERO (P0 2026-07-15)", () => {
    const c = classifyResults([moneyFail("el marcaje incrementa el precio (P0)", "con marcaje 500 vs sin 500")]);
    expect(c.severity).toBe(KIND_MONEY);
  });

  it("solo una superficie caída NO es severidad de dinero", () => {
    // El caso real del 2026-07-29 14:31: /api/recommend devolvió 500 por
    // timeout del LLM. Ninguna invariante de dinero se rompió.
    const c = classifyResults([
      ok("precio base > 0"),
      availFail("POST /api/recommend responde", "status 500"),
      skip("sin proveedor en POST /api/recommend", "superficie devolvió 500"),
    ]);
    expect(c.severity).toBe(KIND_AVAILABILITY);
    expect(c.moneyFails).toHaveLength(0);
  });

  it("dinero gana a disponibilidad cuando coinciden", () => {
    const c = classifyResults([
      moneyFail("sin proveedor en GET /catalogo/taza", 'contiene "cdn1.midocean.com"'),
      availFail("POST /api/recommend responde", "status 500"),
    ]);
    expect(c.severity).toBe(KIND_MONEY);
  });

  it("un invariante NO COMPROBADO nunca cuenta como ok", () => {
    // El fallo de fondo que esto arregla: barrer el cuerpo de un 500 y marcarlo
    // ✓ afirmaba "limpio" sobre una respuesta que no existía.
    const c = classifyResults([skip("sin proveedor en POST /api/recommend", "superficie devolvió 500")]);
    expect(c.oks).toHaveLength(0);
    expect(c.skipped).toHaveLength(1);
    expect(c.severity).toBe(KIND_AVAILABILITY);
  });

  it("no comprobado por sí solo ya deja el job en rojo", () => {
    const c = classifyResults([ok("precio base > 0"), skip("tarjeta con precio cliente > 0", "status 503")]);
    expect(c.severity).not.toBeNull();
  });
});

describe("buildAlertText — el aviso no puede afirmar lo que no consta", () => {
  it("con fallo de dinero mantiene el aviso grave y nombra el check", () => {
    const text = buildAlertText(classifyResults([moneyFail("sin proveedor en GET /catalogo/taza")]), "https://run/1");
    expect(text).toContain("🚨");
    expect(text).toContain("se rompió en producción");
    expect(text).toContain("sin proveedor en GET /catalogo/taza");
    expect(text).toContain("https://run/1");
  });

  it("con solo una superficie caída NO dice que se rompió una invariante", () => {
    const text = buildAlertText(
      classifyResults([
        availFail("POST /api/recommend responde", "status 500"),
        skip("sin proveedor en POST /api/recommend", "superficie devolvió 500"),
      ]),
      "https://run/2",
    );
    expect(text).not.toContain("se rompió en producción");
    expect(text).toContain("NO se han podido comprobar");
    expect(text).toContain("POST /api/recommend responde");
  });

  it("sin fallos no hay texto que enviar", () => {
    expect(buildAlertText(classifyResults([ok("precio base > 0")]))).toBe("");
  });

  it("es siempre una sola línea (GITHUB_OUTPUT es clave=valor por línea)", () => {
    const text = buildAlertText(classifyResults([moneyFail("check\ncon\rsaltos")]), "https://run/3");
    expect(text).not.toMatch(/[\r\n]/);
  });

  it("va acotado para no reventar el mensaje de Telegram", () => {
    const muchos = Array.from({ length: 200 }, (_, i) => moneyFail(`fallo número ${i} con nombre largo`));
    expect(buildAlertText(classifyResults(muchos), "https://run/4").length).toBeLessThanOrEqual(900);
  });
});

describe("esFalloDeConexion — solo se reintenta lo que no llegó a salir", () => {
  const err = (code: string, anidado = false) =>
    anidado ? Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("x"), { code }) }) : Object.assign(new Error("x"), { code });

  it("reconoce el timeout de conexión real que vimos el 29-jul (va en err.cause)", () => {
    expect(esFalloDeConexion(err("UND_ERR_CONNECT_TIMEOUT", true))).toBe(true);
  });

  it("conexión rechazada y DNS que no resuelve sí se reintentan", () => {
    expect(esFalloDeConexion(err("ECONNREFUSED"))).toBe(true);
    expect(esFalloDeConexion(err("ENOTFOUND"))).toBe(true);
  });

  it("un fallo que NO es de conexión no se reintenta", () => {
    // Si el servidor respondió (o cortó tras recibir), repetir duplicaría
    // trabajo: /api/recommend gasta LLM de pago y tiene rate limit.
    expect(esFalloDeConexion(err("UND_ERR_HEADERS_TIMEOUT", true))).toBe(false);
    expect(esFalloDeConexion(new Error("boom"))).toBe(false);
    expect(esFalloDeConexion(undefined)).toBe(false);
  });

  it("no se cuelga con una cadena de causas circular", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(esFalloDeConexion(a)).toBe(false);
  });

  it("el corte por timeout propio NO se reintenta: la petición sí salió", () => {
    // AbortSignal.timeout lanza un DOMException TimeoutError/AbortError, sin
    // `code` de conexión. Reintentarlo duplicaría trabajo de pago en
    // /api/recommend (LLM + rate limit). Es la garantía que sostiene el
    // techo por petición.
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const timeout = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    expect(esFalloDeConexion(abort)).toBe(false);
    expect(esFalloDeConexion(timeout)).toBe(false);
  });
});

describe("timeoutParaIntento — el guard tiene que TERMINAR y llegar a avisar", () => {
  // Razón de ser: el 2026-08-05 03:32 UTC el job se quedó CANCELADO al tocar
  // el timeout del job. Un job cancelado no dispara `if: failure()` ⇒ no salió
  // alerta ninguna. El guard del dinero se apagó en silencio.
  const ahora = 1_000_000;

  it("con presupuesto de sobra concede el techo por petición, no más", () => {
    expect(timeoutParaIntento(ahora + 200_000, ahora, 20_000)).toBe(20_000);
  });

  it("cerca del límite recorta al presupuesto que queda", () => {
    expect(timeoutParaIntento(ahora + 5_000, ahora, 20_000)).toBe(5_000);
  });

  it("sin presupuesto devuelve 0: no se toca la red", () => {
    // Es lo que garantiza que las superficies restantes se salden al instante
    // como NO COMPROBADAS y el barrido llegue a clasificar y avisar.
    expect(timeoutParaIntento(ahora, ahora, 20_000)).toBe(0);
    expect(timeoutParaIntento(ahora - 30_000, ahora, 20_000)).toBe(0);
  });

  it("nunca devuelve un timeout negativo ni infinito", () => {
    for (const deadline of [ahora - 1, ahora, ahora + 1, ahora + 999_999]) {
      const ms = timeoutParaIntento(deadline, ahora, 20_000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeLessThanOrEqual(20_000);
    }
  });

  it("safeFetch está REALMENTE cableado al presupuesto (guard estático)", () => {
    // La función pura se puede testear; el cableado no, porque toca la red. Y
    // sin esto la mutación "safeFetch ignora el presupuesto" pasaba verde:
    // volvería el fallo original con toda la lógica nueva intacta. Mismo patrón
    // que los guards de imagen/texto de proveedor: se lee el fuente.
    const fuente = readFileSync(new URL("../../scripts/money-smoke-test.mjs", import.meta.url), "utf8");
    const cuerpo = fuente.slice(fuente.indexOf("async function safeFetch"));
    const safeFetch = cuerpo.slice(0, cuerpo.indexOf("\nasync function getJson"));

    expect(safeFetch).toMatch(/timeoutParaIntento\(\s*deadline\s*,/);
    // El techo calculado tiene que llegar al fetch, no quedarse en una variable.
    expect(safeFetch).toMatch(/AbortSignal\.timeout\(\s*ms\s*\)/);
    // Y sin presupuesto hay que salir ANTES de tocar la red.
    expect(safeFetch).toMatch(/ms === 0/);
    expect(safeFetch).not.toMatch(/await fetch\(url, opts\)/);
  });

  it("el peor caso completo cabe holgadamente en el timeout del job", () => {
    // 9 peticiones × 3 intentos × 20 s + backoff sería ~9 min sin presupuesto:
    // por eso el job de 3 min moría. Con presupuesto, el suelo duro es BUDGET.
    const BUDGET = 240_000;
    const inicio = ahora;
    let t = inicio;
    let peticiones = 0;
    // Simula el peor caso: cada intento agota su techo y nunca hay respuesta.
    while (timeoutParaIntento(inicio + BUDGET, t, 20_000) > 0 && peticiones < 500) {
      t += timeoutParaIntento(inicio + BUDGET, t, 20_000);
      peticiones++;
    }
    expect(t - inicio).toBeLessThanOrEqual(BUDGET);
    expect(peticiones).toBeLessThan(500); // termina de verdad, no da vueltas
  });
});
