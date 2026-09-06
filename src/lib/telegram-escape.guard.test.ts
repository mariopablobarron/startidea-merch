import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard de REGRESIÓN, no de estilo.
 *
 * `notifyTelegram` envía con parse_mode=HTML. Un valor de usuario con `<`,
 * `>` o `&` hace que Telegram devuelva 400 y el aviso se pierda EN SILENCIO:
 * la función no lanza, devuelve `false`, y todos los llamadores hacen
 * `void notifyTelegram(...).catch(console.error)` — nadie mira el resultado.
 *
 * El 2026-08-18 se auditaron los 45 ficheros que avisan por Telegram: 66
 * interpolaciones de 26 ficheros necesitaban escape y no lo tenían, pese a
 * que `escapeTgHtml` existía desde hacía meses. El problema de fondo es que
 * nada obligaba a pensarlo: se podía añadir un aviso nuevo con el nombre de
 * un cliente y el fallo no aparecía hasta que un cliente se llamara
 * "Fernández & Cía".
 *
 * Este guard no adivina si un valor es peligroso — eso lo decidió la
 * auditoría fichero a fichero. Lo que hace es obligar a DECIDIRLO: si un
 * fichero interpola algo en un mensaje de Telegram, o usa `escapeTgHtml`, o
 * está en la lista de abajo con su motivo escrito.
 */

const SRC = new URL("../", import.meta.url).pathname;

/**
 * Ficheros que interpolan en mensajes de Telegram y NO necesitan escape.
 * Cada uno con el motivo comprobado en la auditoría del 2026-08-18. Añadir
 * algo aquí es una decisión consciente: hay que haber rastreado el valor
 * hasta su origen y comprobado que no puede traer `<`, `>` ni `&`.
 */
const SIN_DATOS_ESCAPABLES: Record<string, string> = {
  "app/api/admin/products/auto-describe/route.ts":
    "solo contadores numéricos (successCount, failCount, missing)",
  "app/api/admin/cart-quotes/[id]/draft-proposal/route.ts":
    "proposalNumber (PROP-AAAA-NNNN) y un cuid recortado",
  "app/api/proposal/[number]/accept/route.ts":
    "proposalNumber, un importe formateado y un email validado por z.string().email() — zod rechaza & y < en el email (comprobado)",
  "app/api/telegram/webhook/route.ts":
    "chatId numérico; el resto va por sendTelegramTo, que SÍ reintenta en texto plano si el HTML no valida",
  "lib/proposal-deliver.ts":
    "proposalNumber, importes formateados y email validado por zod",
  "lib/suppliers/makito-sync.ts":
    "breaker.summary(): solo números (comprobado en lib/sync-circuit-breaker.ts)",
  "lib/suppliers/midocean-sync.ts":
    "breaker.summary(): solo números (comprobado en lib/sync-circuit-breaker.ts)",
  "lib/suppliers/sync-history.ts":
    "nombre de proveedor (enum) y duraciones numéricas",
};

function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficherosTs(p, acc);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

describe("guard: nadie avisa por Telegram con datos sin escapar", () => {
  const ficheros = ficherosTs(SRC)
    .filter((p) => {
      const s = readFileSync(p, "utf8");
      return /notifyTelegram\(|sendTelegramTo\(/.test(s) && !p.endsWith("telegram.ts");
    })
    .map((p) => ({ rel: p.slice(SRC.length), src: readFileSync(p, "utf8") }));

  it("la auditoría encontró un número de llamadores que no puede caer sin más", () => {
    // Si este número baja mucho, alguien borró llamadores o el detector dejó
    // de encontrarlos: el guard estaría "verde" por no mirar nada.
    expect(ficheros.length).toBeGreaterThanOrEqual(40);
  });

  it("todo fichero que interpola en un aviso o escapa, o está justificado", () => {
    const sinEscape = ficheros
      .filter((f) => /\$\{/.test(f.src))
      .filter((f) => !f.src.includes("escapeTgHtml"))
      .map((f) => f.rel)
      .filter((rel) => !(rel in SIN_DATOS_ESCAPABLES));

    expect(
      sinEscape,
      "Estos ficheros avisan por Telegram (parse_mode=HTML) interpolando valores y no usan " +
        "escapeTgHtml. Si el valor puede traer <, > o &, Telegram responde 400 y el aviso se " +
        "pierde sin que nadie se entere. Escápalo, o añádelo a SIN_DATOS_ESCAPABLES con el " +
        "motivo rastreado hasta el origen del valor.",
    ).toEqual([]);
  });

  it("la lista de excusas no acumula entradas muertas", () => {
    // Una excusa que ya no corresponde a ningún fichero es una excusa que
    // nadie ha revisado. Y si el fichero pasó a escapar, sobra.
    const vivos = new Set(ficheros.map((f) => f.rel));
    for (const [rel] of Object.entries(SIN_DATOS_ESCAPABLES)) {
      expect(vivos.has(rel), `${rel} ya no avisa por Telegram: quita su entrada`).toBe(true);
    }
  });

  it("nadie reimplementa el escape a mano DENTRO de un aviso de Telegram", () => {
    // Había DOS copias divergentes, y una (signed-url) no escapaba `>`. Una
    // primitiva duplicada es una primitiva que se arregla solo en un sitio.
    //
    // Se mira SOLO dentro del argumento de la llamada, no el fichero entero:
    // varios de estos ficheros mandan además un email, y el escape de HTML de
    // email es legítimamente OTRO (escapa también `"`, que hace falta en
    // atributos y en Telegram no). Marcar el fichero entero daba un falso
    // positivo en request-callback, que solo tiene el escape del email.
    const copias: string[] = [];
    for (const f of ficheros) {
      for (const m of f.src.matchAll(/(?:notifyTelegram|sendTelegramTo)\(/g)) {
        const trozo = f.src.slice(m.index!, m.index! + 800);
        const fin = trozo.indexOf("\n  )");
        if (/replace\(\/&\/g/.test(fin > 0 ? trozo.slice(0, fin) : trozo)) copias.push(f.rel);
      }
    }
    expect([...new Set(copias)], "usa escapeTgHtml de @/lib/telegram, no un replace propio").toEqual([]);
  });
});

/**
 * Segunda red, porque la primera solo mira el FICHERO.
 *
 * El guard de arriba comprueba que un fichero que avisa por Telegram use
 * `escapeTgHtml` en alguna parte. Eso caza el fichero nuevo que no escapa
 * nada, pero NO caza que una expresión concreta deje de escaparse en un
 * fichero que sigue escapando otras — comprobado mutando: quitar el escape
 * de `proof.cart.name` en reject/route.ts dejaba el guard en verde.
 *
 * Distinguir por expresión requeriría saber qué valores son peligrosos, que
 * es justo lo que no se puede automatizar: lo decidió la auditoría del
 * 2026-08-18 rastreando cada valor hasta su origen. Así que se congela el
 * RECUENTO por fichero. Bajar un número es legítimo (se borró un aviso),
 * pero tiene que ser un acto consciente y quedar en el diff.
 */
const ESCAPES_ESPERADOS: Record<string, number> = {
  "app/api/admin/cart-quotes/[id]/simulate-payment/route.ts": 2,
  "app/api/admin/cotizar/proposal/route.ts": 1,
  "app/api/admin/quote-ai/save/route.ts": 2,
  "app/api/calculadora-rsc/route.ts": 2,
  "app/api/cart-quote/route.ts": 5,
  "app/api/cron/auto-proposal/route.ts": 3,
  "app/api/cron/override-price-drift/route.ts": 1,
  "app/api/cron/publish-scheduled/route.ts": 1,
  "app/api/cron/send-scheduled-broadcasts/route.ts": 2,
  "app/api/cron/stock-alert/route.ts": 3,
  "app/api/cron/voice-agent-health/route.ts": 1,
  "app/api/lead-magnets/[slug]/download/route.ts": 4,
  "app/api/mockup-request/route.ts": 7,
  "app/api/partners/apply/route.ts": 6,
  "app/api/proof/[token]/approve/route.ts": 3,
  "app/api/proof/[token]/reject/route.ts": 3,
  "app/api/proof/[token]/revision/route.ts": 3,
  "app/api/proposal/[number]/pdf/route.ts": 2,
  "app/api/proposal/send/route.ts": 3,
  "app/api/quote-request-product/route.ts": 4,
  "app/api/voice-agent/session-end/route.ts": 4,
  "app/api/voice-agent/signed-url/route.ts": 1,
  "app/api/voice-agent/tools/request-callback/route.ts": 5,
  "app/api/webhooks/resend/route.ts": 1,
  "lib/stripe-post-payment.ts": 3, // El aviso Stripe vive ahora en el motor durable.
  "app/api/webhooks/whatsapp/route.ts": 3,
  "lib/broadcast-send.ts": 1,
  "lib/cifra-auto-order.ts": 4,
  "lib/competitor-intel.ts": 1,
  "lib/makito-auto-order.ts": 10,
  "lib/midocean-auto-order.ts": 4,
  "lib/proposal-mailer.ts": 1,
  "lib/resend.ts": 4,
  "lib/suppliers/cifra-sync.ts": 2,
};

describe("guard: el recuento de escapes por fichero no baja solo", () => {
  it("cada fichero auditado conserva al menos sus escapes", () => {
    const flojos: string[] = [];
    for (const [rel, minimo] of Object.entries(ESCAPES_ESPERADOS)) {
      let src: string;
      try {
        src = readFileSync(join(SRC, rel), "utf8");
      } catch {
        flojos.push(`${rel}: ya no existe (si se borró de verdad, quita su entrada)`);
        continue;
      }
      const n = (src.match(/escapeTgHtml\(/g) || []).length;
      if (n < minimo) flojos.push(`${rel}: ${n} escapes, se esperaban ${minimo}`);
    }
    expect(
      flojos,
      "Un aviso de Telegram ha dejado de escapar un valor. Si el aviso se borró a propósito, " +
        "baja el número en ESCAPES_ESPERADOS en el mismo commit.",
    ).toEqual([]);
  });
});
