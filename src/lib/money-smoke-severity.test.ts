import { describe, it, expect } from "vitest";
// El guard vive en scripts/ (corre en CI con node pelado, sin build). Se importa
// aquí porque su lógica de clasificación decide QUÉ se le dice a quien recibe la
// alerta de dinero, y eso merece test. El módulo está guardado con
// `import.meta.url === argv[1]`, así que importarlo NO toca la red.
import {
  classifyResults,
  buildAlertText,
  esFalloDeConexion,
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
});
