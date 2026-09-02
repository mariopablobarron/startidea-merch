/**
 * Guard POR DESCUBRIMIENTO: recorre `src/` entero buscando datos de usuario
 * interpolados sin escapar dentro de HTML de email o de mensajes de Telegram.
 *
 * Por qué existe, además del guard hermano (`email-html-escape.guard.test.ts`):
 * aquél es una **lista blanca de cinco ficheros** con patrones literales. Vigila
 * muy bien que no vuelva la regresión concreta que ya se arregló, pero **por
 * diseño no puede ver un fichero nuevo**. Eso costó dos hallazgos seguidos:
 *
 *   - `lead-magnets/[slug]/download` (20-ago): su HTML estaba inline en el
 *     route handler, y el barrido de `54584b6` inventarió `src/lib`.
 *   - `review/[token]` y `proof/[token]/{approve,reject,revision}` (21-ago):
 *     lo mismo — HTML inline en el handler, cuatro rutas públicas fuera de
 *     ambos inventarios.
 *
 * Este guard invierte la carga: **descubre** los ficheros él solo y falla ante
 * cualquier interpolación NUEVA de un campo con nombre de dato de usuario. Lo
 * ya revisado vive en `ACEPTADAS`, con su motivo; añadir algo ahí es una
 * decisión consciente, no un descuido.
 *
 * Qué NO hace: no es un analizador de taint. Es una heurística por nombre de
 * campo y por línea. Puede tener falsos positivos (se documentan en
 * `ACEPTADAS`) y no ve un dato de usuario guardado antes en una variable de
 * nombre neutro. Vale como red, no como demostración.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const SRC = join(RAIZ, "src");

/** Marcas de que la línea está construyendo HTML (o markup de Telegram). */
const MARKUP = /<(p|div|h[1-9]|strong|b|i|blockquote|td|tr|table|a|span|code|em|br|li|ul|img)\b|href=/i;

/** `${...}`, tolerando un nivel de llaves anidadas. */
const INTERPOLACION = /\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

/** Formas de neutralizar el dato que damos por buenas. */
const SANEADO = /escapeHtml\(|escapeAttr\(|escapeMultiline\(|escapeTgHtml\(|safeLogoHref|safeArtworkHref|linkOrPlainText\(|encodeURIComponent\(/;

/** Nombres que delatan un dato escrito por una persona de fuera. */
const CAMPO_DE_USUARIO =
  /\b(name|email|company|phone|comment|reason|message|deadline|authorName|authorCompany|artworkUrl|customerLogo\w*|referrer)\b/i;

/**
 * Interpolaciones ya revisadas a mano, por fichero. El motivo importa tanto
 * como la excepción: casi todas son el saludo por nombre de pila en un email
 * dirigido **a esa misma persona** (quien escribió el nombre es quien lo lee,
 * así que no hay a quién suplantar), o datos que fija el equipo desde el admin.
 */
const ACEPTADAS: Record<string, string[]> = {
  // Saludo por nombre de pila en el email al propio cliente.
  "src/app/api/admin/cart-quotes/[id]/customer-link/route.ts": ['cart.name.split(" ")[0]'],
  "src/app/api/admin/cart-quotes/[id]/payment-link/route.ts": ['cart.name.split(" ")[0]'],
  "src/app/api/admin/cart-quotes/[id]/proofs/route.ts": ['cart.name.split(" ")[0]'],
  "src/app/api/clientes/auth/magic-link/route.ts": ['user.name.split(" ")[0]'],
  "src/app/api/cron/quote-followup/route.ts": ["firstName || cart.name"],
  "src/app/api/newsletter/subscribe/route.ts": ['data.name ? ` ${data.name.split(" ")[0]}` : ""'],
  // Mismo caso: el "Hola {nombre}" de la confirmación va al propio solicitante.
  "src/app/api/quote-request-product/route.ts": ['d.name ? ` ${d.name}` : ""'],
  "src/app/api/admin/ruleta/draw/route.ts": ['winner.name ? `, ${winner.name.split(" ")[0]}` : ""'],
  // Datos internos: nombre de producto del catálogo y títulos que generamos.
  "src/app/api/cron/insights-digest/route.ts": ["p.name", "s.title"],
  "src/app/api/cron/insights-digest-monthly/route.ts": ["aRange.label", "bRange.label", "s.title"],
  // Premios de la ruleta: los fija el equipo en AdminSetting, no el visitante.
  "src/app/api/ruleta/spin/route.ts": [
    "prize.label",
    'prize.perkNote ?? "Menciona este email al hacer tu pedido y te lo aplicamos."',
  ],
  // Dos literales nuestros ("Te has dado de baja" / el error), no entrada externa.
  "src/app/api/newsletter/unsubscribe/route.ts": ["message"],
  // Literal nuestro: "complaint" o "bounce", no entra nada de fuera.
  "src/app/api/webhooks/resend/route.ts": ["reason"],
  // Ya viene de escapeHtml() dos líneas antes; la heurística es por línea.
  "src/lib/stripe-paid-emails.ts": ["label"],
};

function ficherosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const abs = join(dir, entrada);
    if (statSync(abs).isDirectory()) salida.push(...ficherosTs(abs));
    else if (entrada.endsWith(".ts") && !entrada.endsWith(".test.ts")) salida.push(abs);
  }
  return salida;
}

type Hallazgo = { fichero: string; linea: number; expr: string };

function barrer(): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const abs of ficherosTs(SRC)) {
    const rel = abs.slice(RAIZ.length + 1);
    const lineas = readFileSync(abs, "utf8").split("\n");
    lineas.forEach((linea, i) => {
      if (!linea.includes("${") || !MARKUP.test(linea)) return;
      for (const m of linea.matchAll(INTERPOLACION)) {
        const expr = m[1].trim();
        if (SANEADO.test(expr) || !CAMPO_DE_USUARIO.test(expr)) continue;
        if (ACEPTADAS[rel]?.includes(expr)) continue;
        hallazgos.push({ fichero: rel, linea: i + 1, expr });
      }
    });
  }
  return hallazgos;
}

describe("guard por descubrimiento: datos de usuario en HTML de email", () => {
  it("ningún fichero de src/ interpola un campo de usuario sin escapar", () => {
    const hallazgos = barrer();
    const detalle = hallazgos
      .map((h) => `  ${h.fichero}:${h.linea}  \${${h.expr}}`)
      .join("\n");
    expect(
      hallazgos,
      `Interpolación sin escapar de un dato de usuario en HTML de email:\n${detalle}\n\n` +
        "Escápala con escapeHtml() (o escapeTgHtml() si es Telegram), o —si de verdad " +
        "es segura— añádela a ACEPTADAS con el motivo.",
    ).toEqual([]);
  });

  it("el barrido llega a las rutas que se le escaparon a la lista blanca", () => {
    // Si un refactor mueve o renombra estos ficheros, este guard dejaría de
    // mirarlos en silencio. Mejor que se entere aquí.
    const vistos = ficherosTs(SRC).map((f) => f.slice(RAIZ.length + 1));
    for (const rel of [
      "src/app/api/review/[token]/route.ts",
      "src/app/api/proof/[token]/approve/route.ts",
      "src/app/api/proof/[token]/reject/route.ts",
      "src/app/api/proof/[token]/revision/route.ts",
      "src/app/api/lead-magnets/[slug]/download/route.ts",
      "src/lib/proof-review-emails.ts",
    ]) {
      expect(vistos, `${rel} ya no existe o cambió de sitio`).toContain(rel);
    }
    expect(vistos.length).toBeGreaterThan(200);
  });

  it("sabe encontrar el fallo cuando SÍ está (anti-falso-verde)", () => {
    // Las tres piezas que tienen que coincidir para que salte una alarma.
    const linea = '        html: `<p>El cliente <strong>${proof.cart.name}</strong></p>`,';
    expect(MARKUP.test(linea)).toBe(true);
    const exprs = [...linea.matchAll(INTERPOLACION)].map((m) => m[1].trim());
    expect(exprs).toContain("proof.cart.name");
    expect(CAMPO_DE_USUARIO.test("proof.cart.name")).toBe(true);
    expect(SANEADO.test("proof.cart.name")).toBe(false);
    // Y que reconoce la versión escapada como buena.
    expect(SANEADO.test("escapeHtml(proof.cart.name)")).toBe(true);
  });

  it("las excepciones de ACEPTADAS existen de verdad en su fichero", () => {
    // Una excepción que ya no corresponde a nada tapa el sitio donde vivía.
    for (const [rel, exprs] of Object.entries(ACEPTADAS)) {
      const src = readFileSync(join(RAIZ, rel), "utf8");
      for (const expr of exprs) {
        expect(src.includes(`\${${expr}}`), `ACEPTADAS tiene ${expr} de sobra en ${rel}`).toBe(true);
      }
    }
  });
});
