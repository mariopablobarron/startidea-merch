/**
 * Guard POR DESCUBRIMIENTO: quién puede tocar `MediaAsset.originalUrl`.
 *
 * `originalUrl` es el único sitio del sistema donde vive en claro la URL del
 * CDN del proveedor. Todo lo que ve el cliente pasa por `/api/m/<hash>`
 * (`proxy-image.ts`), así que ese campo es la fuente del dato que la regla nº2
 * prohíbe emitir: fue exactamente lo que se escapó el 2026-07-20 por
 * `/api/recommend` (ver [[incident_midocean_image_leak_20260720]]).
 *
 * No es una lista blanca de lo ya conocido —eso solo probaría que no vuelve lo
 * viejo—: se recorre `src/` entero y CUALQUIER fichero que lea el campo tiene
 * que estar declarado aquí abajo con su motivo escrito. Un consumidor nuevo
 * suspende este guard hasta que alguien lo mire, que es justo el momento en
 * que hay que mirarlo.
 *
 * Para los consumidores que son superficie PÚBLICA se pide además que
 * importen `mensaje-error-publico`: ahí el peligro no es imprimir la URL a
 * propósito (nadie lo hace) sino que se cuele dentro del mensaje de una
 * excepción. Ver la medición en `mensaje-error-publico.ts`.
 *
 * Límite honesto: esto lee el texto fuente. De lo que sale de verdad por el
 * cable responde el barrido vivo (`public-leak-audit.live.test.ts`).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();

type Lector = { fichero: string; publica: boolean; motivo: string };

/** Consumidores declarados de `MediaAsset.originalUrl`, con su porqué. */
const LECTORES_DECLARADOS: Lector[] = [
  {
    fichero: "src/lib/proxy-image.ts",
    publica: false,
    motivo:
      "Es el dueño del campo: calcula el hash y hace el upsert. Solo escribe si new URL(...) parsea y el host es de proveedor.",
  },
  {
    fichero: "src/app/api/m/[hash]/route.ts",
    publica: true,
    motivo:
      "El proxy: resuelve el hash y hace fetch a la URL real server-side. Devuelve la imagen, nunca la URL. Tiene su propia defensa SSRF.",
  },
  {
    fichero: "src/app/api/mockup/generate/route.ts",
    publica: true,
    motivo:
      "Compone el mockup server-side: necesita la URL real porque el contenedor no puede auto-llamarse por el FQDN externo. Devuelve un PNG propio.",
  },
];

/**
 * Los tests quedan fuera: no son código que llegue a un cliente, y varios usan
 * el campo a propósito para probar el proxy. Todo lo demás de `src/` se mira.
 */
const ES_TEST = /\.(test|spec)\.tsx?$/;

/** Todo `.ts`/`.tsx` de `src`, descubierto — no enumerado. */
function descubrirFuentes(dir = "src", acc: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) descubrirFuentes(ruta, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(ruta);
  }
  return acc;
}

/**
 * ¿Este fichero lee el campo del modelo? Se busca `originalUrl` como palabra,
 * ignorando comentarios: varios ficheros lo NOMBRAN al explicar el proxy sin
 * tocarlo, y un guard que falle por una frase acaba desactivado.
 */
function leeOriginalUrl(fuente: string): boolean {
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
  return /\boriginalUrl\b/.test(sinComentarios);
}

describe("guard: quién toca MediaAsset.originalUrl", () => {
  const encontrados = descubrirFuentes()
    .map((f) => relative(".", f))
    .filter((f) => !ES_TEST.test(f))
    .filter((f) => leeOriginalUrl(readFileSync(join(RAIZ, f), "utf8")));

  it("ningún fichero lee originalUrl sin estar declarado", () => {
    const declarados = new Set(LECTORES_DECLARADOS.map((l) => l.fichero));
    const sinDeclarar = encontrados.filter((f) => !declarados.has(f));
    expect(
      sinDeclarar,
      `Ficheros nuevos que leen MediaAsset.originalUrl (la URL en claro del CDN del proveedor) ` +
        `sin declararse en media-original-url.guard.test.ts: ${sinDeclarar.join(", ")}. ` +
        `Si el uso es legítimo, decláralo con su motivo; si sale hacia el cliente, es una fuga.`,
    ).toEqual([]);
  });

  it("no se declara un lector que ya no existe (la lista no se pudre)", () => {
    const huerfanos = LECTORES_DECLARADOS.map((l) => l.fichero).filter(
      (f) => !encontrados.includes(f),
    );
    expect(
      huerfanos,
      `Declarados como lectores de originalUrl pero ya no lo leen: ${huerfanos.join(", ")}`,
    ).toEqual([]);
  });

  it("todo lector público sanea los mensajes de excepción que emite", () => {
    const sinFrontera = LECTORES_DECLARADOS.filter((l) => l.publica).filter((l) => {
      const fuente = readFileSync(join(RAIZ, l.fichero), "utf8");
      // Solo importa si devuelve el mensaje de la excepción al cliente.
      const emiteMensaje = /instanceof\s+Error\s*\?[^;{}]*\.message/.test(
        fuente.replace(/console\.(error|warn|log)\([^\n]*\n?/g, ""),
      );
      if (!emiteMensaje) return false;
      return !fuente.includes("mensajeErrorPublico");
    });
    expect(
      sinFrontera.map((l) => l.fichero),
      "Superficie pública que lee originalUrl e interpola el mensaje de una excepción sin pasar " +
        "por mensajeErrorPublico(): `fetch` mete la URL dentro de su propio mensaje.",
    ).toEqual([]);
  });

  it("cada lector declarado explica por qué", () => {
    for (const l of LECTORES_DECLARADOS) {
      expect(l.motivo.length, l.fichero).toBeGreaterThan(40);
    }
  });
});
