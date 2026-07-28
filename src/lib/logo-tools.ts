/**
 * Herramientas de logo del cliente. Fase A: eliminación de fondo vía el
 * sidecar rembg (danielgatis/rembg en modo servidor, SOLO red interna —
 * mismo patrón que merch-meili).
 *
 * SIEMPRE opcional: cualquier fallo (contenedor caído, timeout, formato raro)
 * devuelve null y el llamante sigue con el logo original — la generación de
 * mockups jamás depende de este servicio.
 */

const REMBG_HOST = process.env.REMBG_HOST || "http://merch-rembg:7000";
const REMBG_TIMEOUT_MS = 8_000;

export async function removeLogoBackgroundSafe(logo: Buffer): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REMBG_TIMEOUT_MS);
  try {
    const form = new FormData();
    // Copia a ArrayBuffer propio: Buffer puede apoyarse en SharedArrayBuffer y
    // el tipado de BlobPart lo rechaza.
    const bytes = new Uint8Array(logo.byteLength);
    bytes.set(logo);
    form.append("file", new Blob([bytes.buffer]), "logo.png");
    const res = await fetch(`${REMBG_HOST}/api/remove`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[logo-tools] rembg HTTP ${res.status}`);
      return null;
    }
    const out = Buffer.from(await res.arrayBuffer());
    // Sanidad: PNG válido y no vacío (rembg devuelve PNG con alpha)
    if (out.length < 100 || out[0] !== 0x89 || out[1] !== 0x50) {
      console.error("[logo-tools] rembg devolvió algo que no es PNG");
      return null;
    }
    return out;
  } catch (e) {
    console.error("[logo-tools] rembg no disponible:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(t);
  }
}
