import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD de la paleta del Manual de identidad Startidea v1.0.
 *
 * El manual **prohíbe expresamente** el crema `#F4EFE6` y el hueso `#EAE3D3`
 * que la web usaba de fondo, y el negro puro. Cambiar los tokens de Tailwind
 * arregla el presente; este guard arregla el futuro: el color viejo vuelve por
 * un copiar y pegar de una plantilla de email antigua, no por una decisión.
 *
 * Mira el CÓDIGO, no los comentarios: la documentación de este repositorio cita
 * los colores retirados a la letra —y debe poder seguir haciéndolo— para
 * explicar de dónde viene cada cambio.
 */

const RAIZ = join(__dirname, "..", "..");

/**
 * Los mismos colores retirados, pero escritos en `rgb()`/`rgba()`.
 *
 * El barrido de la migración solo miraba hexadecimales y **se dejó 21**: el pie
 * oscuro de todos los emails transaccionales seguía pintando el texto en crema
 * `rgba(244,239,230,…)`. Un color no deja de ser el color retirado por estar
 * escrito de otra manera, y en un email no hay clases de Tailwind que te
 * salven: se escribe a mano y sobrevive a cualquier cambio de tokens.
 */
const RETIRADOS_RGB: Record<string, string> = {
  "244,239,230": "255,255,255 (blanco)",
  "234,227,211": "231,226,230 (línea)",
  "250,247,241": "255,255,255 (blanco)",
  "230,62,115": "196,29,81 (magenta oficial)",
  "160,32,73": "143,16,57 (vino oficial)",
  "42,42,42": "35,31,39 (tinta)",
  "26,26,26": "35,31,39 (tinta)",
  "110,110,110": "94,90,99 (gris)",
};

/** Color retirado → con qué se sustituye. */
const RETIRADOS: Record<string, string> = {
  "#F4EFE6": "#FFFFFF (fondo blanco)",
  "#EAE3D3": "#E7E2E6 (línea)",
  "#FAF7F1": "#FDEEF3 (rosa pálido)",
  "#E63E73": "#C41D51 (magenta oficial)",
  "#C42B5D": "#A81845",
  "#A02049": "#8F1039 (vino oficial)",
  "#2A2A2A": "#231F27 (tinta)",
  "#6E6E6E": "#5E5A63 (gris)",
};

/** Negro puro, en cualquiera de sus formas. */
const NEGRO_PURO = /#000\b|#000000\b|\brgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i;

/**
 * Excepciones revisadas a mano, con su motivo. La regla es sobre la paleta de
 * la MARCA; un negro que es contenido —una tabla de tintas Pantone donde el
 * Process Black es literalmente el color del que se habla— no es una decisión
 * de diseño de la web.
 */
const NEGRO_ACEPTADO: Record<string, string> = {
  "src/app/recursos/guia-pantone-serigrafia-corporativa/page.tsx":
    "tabla de equivalencias Pantone: el Process Black #000000 es el dato, no un color de la interfaz",
};

function ficheros(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      ficheros(ruta, acc);
    } else if (/\.(ts|tsx|css)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acc.push(ruta);
    }
  }
  return acc;
}

/** Quita comentarios de bloque, de línea y CSS: la documentación puede citar. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

const FUENTES = [...ficheros(join(RAIZ, "src")), join(RAIZ, "tailwind.config.ts")].map((ruta) => ({
  rel: ruta.slice(RAIZ.length + 1),
  codigo: soloCodigo(readFileSync(ruta, "utf8")),
}));

describe("guard · la paleta retirada no vuelve", () => {
  it("las excepciones siguen existiendo (si no, sobran)", () => {
    // Una excepción a un fichero que ya no existe es ruido que despista al
    // siguiente que lea esta lista.
    for (const rel of Object.keys(NEGRO_ACEPTADO)) {
      expect(FUENTES.some((f) => f.rel === rel), `${rel} ya no existe: quita la excepción`).toBe(true);
    }
  });

  it("el guard está mirando el repositorio de verdad (anti-falso-verde)", () => {
    expect(FUENTES.length).toBeGreaterThan(200);
    expect(FUENTES.some((f) => f.rel === "tailwind.config.ts")).toBe(true);
  });

  it.each(Object.entries(RETIRADOS))("nadie vuelve a escribir %s → usa %s", (viejo, reemplazo) => {
    const culpables = FUENTES.filter((f) => f.codigo.toUpperCase().includes(viejo)).map((f) => f.rel);
    expect(culpables, `${viejo} sigue en: ${culpables.join(", ")}. Sustitúyelo por ${reemplazo}.`).toEqual(
      [],
    );
  });

  it.each(Object.entries(RETIRADOS_RGB))(
    "tampoco vuelve rgb(%s) → usa %s",
    (trio, reemplazo) => {
      // Escapado para el punto y las comas: el trío va tal cual dentro de rgb().
      const [r, g, b] = trio.split(",");
      const re = new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`, "i");
      const culpables = FUENTES.filter((f) => re.test(f.codigo)).map((f) => f.rel);
      expect(
        culpables,
        `rgb(${trio}) sigue en: ${culpables.join(", ")}. Sustitúyelo por ${reemplazo}.`,
      ).toEqual([]);
    },
  );

  it("no hay negro puro: el manual lo prohíbe como fondo y como tinta", () => {
    const culpables = FUENTES.filter(
      (f) => NEGRO_PURO.test(f.codigo) && !(f.rel in NEGRO_ACEPTADO),
    ).map((f) => f.rel);
    expect(culpables, `Negro puro en: ${culpables.join(", ")}. La tinta es #231F27.`).toEqual([]);
  });
});

describe("los tokens de Tailwind son los del manual", () => {
  const config = readFileSync(join(RAIZ, "tailwind.config.ts"), "utf8");

  it.each([
    ["fondo", 'DEFAULT: "#FFFFFF"'],
    ["superficie neutra", 'soft: "#F7F5F7"'],
    ["rosa pálido", 'wash: "#FDEEF3"'],
    ["tinta", 'DEFAULT: "#231F27"'],
    ["gris", 'mute: "#5E5A63"'],
    ["línea", 'DEFAULT: "#E7E2E6"'],
    ["magenta", 'DEFAULT: "#C41D51"'],
    ["vino", 'deep: "#8F1039"'],
  ])("%s", (_nombre, literal) => {
    expect(config).toContain(literal);
  });

  it("los titulares van en Montserrat y el texto en Inter", () => {
    expect(config).toMatch(/display: \[.*font-display.*Montserrat/);
    expect(config).toMatch(/sans: \[.*font-sans.*Inter/);
  });
});
