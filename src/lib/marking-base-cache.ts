/**
 * Cache local de bases técnicas de marcaje (printposition-img-api-v2).
 *
 * Cuando el endpoint /api/mockup/generate necesita la imagen base con
 * el área de marcaje delimitada (la que el proveedor expone vía
 * MarkingPosition.imageUrl), primero pide al cache local. Si no
 * existe, descarga del CDN remoto y guarda para futuras peticiones.
 *
 * Motivos:
 *  1. Anti-rotura: si el proveedor migra el CDN (de v2 a v3, etc),
 *     todas las URLs en BD quedan obsoletas. Con cache local
 *     mantenemos servicio mientras re-syncamos.
 *  2. Privacidad: las URLs del proveedor revelan el sourcing en
 *     algunos casos. Aunque el endpoint server-side las descarga
 *     internamente, mantener el cache local nos blinda.
 *  3. Performance: una vez cacheada, la primera carga del mockup
 *     ahorra ~200-500 ms del round-trip al CDN externo.
 *
 * Almacenamiento: `${UPLOADS_DIR}/marking-bases/<hash>.<ext>` —
 * mismo volumen merch_uploads que customer-logos y magnific-assets.
 * Hash determinístico de la URL remota para no duplicar.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const KIND = "marking-bases";
const DIR = path.join(UPLOADS_DIR, KIND);

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function urlHash(url: string): string {
  const buf = createHash("sha1").update(url).digest();
  let bits = 0n;
  for (let i = 0; i < 10; i++) bits = (bits << 8n) | BigInt(buf[i]);
  let s = "";
  for (let i = 0; i < 16; i++) {
    s = ALPHABET[Number(bits & 31n) % ALPHABET.length] + s;
    bits >>= 5n;
  }
  return s;
}

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[ct.split(";")[0].trim()] || "jpg";
}

/**
 * Devuelve el buffer de la base técnica. Si está cacheada localmente
 * la sirve sin tocar la red. Si no, descarga del remoteUrl, guarda
 * en disco y devuelve.
 *
 * Si la descarga remota falla, devuelve `null` para que el caller
 * decida fallback (ej. usar primaryImageUrl del producto).
 */
export async function getMarkingBase(remoteUrl: string): Promise<Buffer | null> {
  if (!remoteUrl) return null;

  const hash = urlHash(remoteUrl);
  await mkdir(DIR, { recursive: true });

  // Buscar archivo cacheado (cualquiera de las extensiones soportadas)
  for (const ext of ["png", "jpg", "webp"]) {
    const candidate = path.join(DIR, `${hash}.${ext}`);
    try {
      const st = await stat(candidate);
      if (st.isFile() && st.size > 0) {
        return await readFile(candidate);
      }
    } catch {
      /* not found, sigue */
    }
  }

  // No cacheado: descargar
  try {
    const res = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TodoMerchandising/1.0)",
        Accept: "image/jpeg,image/png,image/*,*/*;q=0.8",
      },
      // Timeout razonable para evitar bloquear el endpoint de mockup
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[marking-base] download failed ${res.status} for ${remoteUrl.slice(0, 60)}`);
      return null;
    }
    const ct = res.headers.get("content-type") || "image/jpeg";
    const ext = extFromContentType(ct);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return null;

    // Guardar para próximas peticiones (fire-and-forget — si falla la
    // escritura, seguimos sirviendo el buffer al cliente actual)
    void writeFile(path.join(DIR, `${hash}.${ext}`), buffer).catch((e) => {
      console.warn("[marking-base] write failed:", e instanceof Error ? e.message : e);
    });

    return buffer;
  } catch (e) {
    console.error("[marking-base] fetch error:", e instanceof Error ? e.message : e);
    return null;
  }
}
