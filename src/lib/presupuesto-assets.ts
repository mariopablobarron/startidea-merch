/**
 * Lee del disco lo que ya vive en `presupuestos/`: la plantilla aprobada, sus
 * tipografías y el logotipo.
 *
 * La plantilla es el MOTOR del generador, no una copia de referencia: el CSS
 * que pinta el PDF sale de ese archivo. Duplicar los estilos aquí garantizaría
 * que el documento del panel y el que se genera a mano se separen a la primera
 * corrección de maquetación que solo se aplique en uno.
 *
 * Todo se embebe en base64 dentro del HTML generado. Sale un documento
 * autocontenido: se imprime igual con red o sin ella, se puede guardar y
 * reenviar, y no hace falta publicar las tipografías en `public/`.
 */

import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const RAIZ = join(process.cwd(), "presupuestos");

function leer(rel: string): Buffer {
  return readFileSync(join(RAIZ, rel));
}

function dataUri(rel: string, mime: string): string {
  return `data:${mime};base64,${leer(rel).toString("base64")}`;
}

let cacheCss: string | null = null;
let cacheLogo: string | null = null;

/**
 * El bloque `<style>` de la plantilla, con las tipografías embebidas.
 *
 * Se cachea en memoria: el archivo no cambia en caliente y son 250 KB de
 * fuentes que no hace falta releer en cada presupuesto.
 */
export function plantillaCss(): string {
  if (cacheCss) return cacheCss;

  const html = leer("plantilla-presupuesto-startidea.html").toString("utf8");
  const m = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (!m) {
    throw new Error(
      "La plantilla de presupuesto no tiene bloque <style>: presupuestos/plantilla-presupuesto-startidea.html",
    );
  }

  const fuentes: Record<string, string> = {
    "assets/fonts/montserrat-latin.woff2": dataUri("assets/fonts/montserrat-latin.woff2", "font/woff2"),
    "assets/fonts/montserrat-latin-ext.woff2": dataUri("assets/fonts/montserrat-latin-ext.woff2", "font/woff2"),
    "assets/fonts/inter-latin.woff2": dataUri("assets/fonts/inter-latin.woff2", "font/woff2"),
    "assets/fonts/inter-latin-ext.woff2": dataUri("assets/fonts/inter-latin-ext.woff2", "font/woff2"),
  };

  let css = m[1];
  for (const [ruta, uri] of Object.entries(fuentes)) {
    css = css.split(`'${ruta}'`).join(`'${uri}'`);
  }
  cacheCss = css;
  return css;
}

/** El logotipo oficial, tal cual: sin recomponer ni invertir. */
export function logoDataUri(): string {
  if (!cacheLogo) cacheLogo = dataUri("assets/logo-startidea.png", "image/png");
  return cacheLogo;
}

// ─── Imágenes subidas desde el panel ──────────────────────────────────────

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

const MIME_POR_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Convierte una imagen subida (`/files/presupuestos/…`) en un `data:` URI.
 *
 * El documento tiene que poder abrirse fuera de la aplicación —el render a PDF
 * lo carga desde un archivo temporal, y Mario puede guardarse el HTML y
 * reenviarlo— y ahí una ruta como `/files/...` no resuelve contra nada: se vería
 * el hueco de la imagen. Las tipografías y el logotipo ya van empotrados por lo
 * mismo.
 *
 * Devuelve `null` si la ruta no es una imagen del panel o si el archivo ya no
 * está: quien llama decide, y el documento se genera igual sin esa foto.
 */
export function imagenSubidaDataUri(url: string): string | null {
  if (!url.startsWith("/files/presupuestos/")) return null;

  const relativa = url.slice("/files/".length).split("?")[0];
  const destino = resolve(join(UPLOADS_DIR, relativa));
  const base = resolve(UPLOADS_DIR);
  // Path traversal: el nombre viene de la base de datos, pero la base de datos
  // la escribe un formulario.
  if (!destino.startsWith(base + sep)) return null;

  const punto = destino.lastIndexOf(".");
  const mime = MIME_POR_EXTENSION[destino.slice(punto).toLowerCase()];
  if (!mime) return null;

  try {
    return `data:${mime};base64,${readFileSync(destino).toString("base64")}`;
  } catch {
    return null;
  }
}
