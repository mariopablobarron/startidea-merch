/**
 * Persistencia local de imágenes Magnific.
 *
 * Las URLs que devuelve Magnific son CDN-firmadas con tokens que expiran en
 * ~1-24h. Si no descargamos la imagen, perdemos acceso permanente.
 *
 * Para evitar esto, en cuanto una tarea está COMPLETED descargamos la imagen
 * a `/app/uploads/magnific-assets/` (volumen Docker persistente) y guardamos
 * en BD la URL pública local `/files/magnific-assets/<taskId>.<ext>`.
 *
 * Mismo volumen que ya usan customer-logos. Se mantiene entre redeploys.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const KIND = "magnific-assets";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Descarga una imagen desde una URL remota (típicamente Magnific CDN) y la
 * guarda en disco. Devuelve la URL pública local persistente.
 *
 * @returns objeto con `url` (pública, sirve `/files/...`) y `bytes`. Si falla,
 *   devuelve `null` y el caller debe quedarse con la URL remota como fallback.
 */
export async function persistRemoteImage(
  remoteUrl: string,
  taskId: string,
): Promise<{ url: string; bytes: number } | null> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(`[magnific-storage] Failed to download ${remoteUrl}: HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const ext = MIME_TO_EXT[contentType.split(";")[0].trim()] || "png";
    const buffer = Buffer.from(await res.arrayBuffer());

    const dir = path.join(UPLOADS_DIR, KIND);
    await mkdir(dir, { recursive: true });

    const filename = `${taskId}.${ext}`;
    await writeFile(path.join(dir, filename), buffer);

    return {
      url: `/files/${KIND}/${filename}`,
      bytes: buffer.byteLength,
    };
  } catch (e) {
    console.error("[magnific-storage] persist failed:", e);
    return null;
  }
}
