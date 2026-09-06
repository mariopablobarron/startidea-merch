/**
 * Render del presupuesto a PDF en el servidor.
 *
 * Es el mismo camino que `presupuestos/generar-pdf.sh`: se escribe el HTML en un
 * archivo temporal y se le pide a Chromium que lo imprima. No hay una segunda
 * maquetación en React-PDF ni nada parecido — el documento sale de la plantilla
 * aprobada o no sale.
 *
 * ── Por qué hace falta un Chromium ──────────────────────────────────────────
 * Un PDF de tres páginas A4 con `@page`, degradados, tipografías embebidas y
 * saltos de página controlados es exactamente lo que un motor de navegador sabe
 * hacer. La alternativa era imprimir a mano desde el navegador, que funciona
 * pero deja el archivo con el nombre que decida el sistema y obliga a acordarse
 * de quitar márgenes y activar gráficos de fondo. Aquí sale bien siempre.
 *
 * ── Si el binario no está ───────────────────────────────────────────────────
 * `renderPresupuestoPdf` lanza `ChromiumNoDisponible`. Quien llama lo traduce en
 * un 503 con instrucciones, y el panel sigue ofreciendo «Ver documento» para
 * imprimir desde el navegador: la funcionalidad se degrada, no se rompe.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class ChromiumNoDisponible extends Error {
  constructor() {
    super(
      "No hay un Chromium disponible para generar el PDF. Instálalo en la imagen " +
        "(apk add --no-cache chromium) o apunta CHROMIUM_PATH al binario. Mientras " +
        "tanto, «Ver documento» abre el presupuesto para imprimirlo desde el navegador.",
    );
    this.name = "ChromiumNoDisponible";
  }
}

/**
 * Rutas donde puede estar el binario, en orden.
 *
 * `CHROMIUM_PATH` manda: es lo que se pone en el compose si el binario vive en
 * otro sitio. Después, la ruta de Alpine (la de la imagen), las de Debian y la
 * del Chromium de Playwright de los contenedores de desarrollo.
 */
export const RUTAS_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  // Contenedores de desarrollo: enlace directo al Chromium de Playwright.
  "/opt/pw-browsers/chromium",
].filter((r): r is string => Boolean(r));

/** Primer binario que existe, o `null`. Puro para poder testearlo. */
export function elegirChromium(
  rutas: string[] = RUTAS_CHROMIUM,
  existe: (ruta: string) => boolean = existsSync,
): string | null {
  return rutas.find((ruta) => existe(ruta)) ?? null;
}

/**
 * Nombre del archivo que descarga Mario.
 *
 * Sale del cliente, así que se limpia: un nombre con barras o comillas rompe la
 * cabecera `Content-Disposition` y, con mala suerte, escribe donde no debe.
 */
export function nombreArchivoPdf(cliente: string, numero: string): string {
  const limpio = cliente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `Presupuesto_${limpio || "Cliente"}_${numero}_Startidea.pdf`;
}

const TIEMPO_MAXIMO_MS = 60_000;

/**
 * Los renders se hacen de uno en uno.
 *
 * Cada Chromium se come varios cientos de MB; tres pestañas del panel pidiendo
 * PDF a la vez tumbarían el VPS, que es el mismo que sirve la tienda. La cola
 * es una promesa encadenada: sencilla, en proceso, y suficiente para un panel
 * que usan dos personas.
 */
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

async function imprimir(html: string, binario: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "presupuesto-"));
  const entrada = join(dir, "presupuesto.html");
  const salida = join(dir, "presupuesto.pdf");
  try {
    await writeFile(entrada, html, "utf8");

    await new Promise<void>((resolver, rechazar) => {
      const proceso = spawn(
        binario,
        [
          "--headless",
          // El contenedor corre sin privilegios y sin user namespaces: sin esto
          // Chromium no arranca. El HTML es nuestro, no viene de fuera.
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-pdf-header-footer",
          `--print-to-pdf=${salida}`,
          `file://${entrada}`,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );

      let errores = "";
      proceso.stderr?.on("data", (d) => {
        errores += String(d);
      });

      const reloj = setTimeout(() => {
        proceso.kill("SIGKILL");
        rechazar(new Error(`El render tardó más de ${TIEMPO_MAXIMO_MS / 1000} s y se ha cortado`));
      }, TIEMPO_MAXIMO_MS);

      proceso.on("error", (e) => {
        clearTimeout(reloj);
        rechazar(e);
      });
      proceso.on("close", (codigo) => {
        clearTimeout(reloj);
        // Chromium escribe avisos de dbus y de sandbox en stderr y sale con 0;
        // lo que decide es que el PDF esté.
        if (codigo === 0 || existsSync(salida)) resolver();
        else rechazar(new Error(`Chromium salió con código ${codigo}. ${errores.slice(-400)}`));
      });
    });

    return await readFile(salida);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** HTML del presupuesto → PDF. Lanza `ChromiumNoDisponible` si no hay binario. */
export async function renderPresupuestoPdf(html: string): Promise<Buffer> {
  const binario = elegirChromium();
  if (!binario) throw new ChromiumNoDisponible();
  return enCola(() => imprimir(html, binario));
}
