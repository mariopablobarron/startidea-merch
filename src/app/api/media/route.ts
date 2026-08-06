import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSigningSecret } from "@/lib/signing-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy de imágenes — oculta los CDN de proveedores (MidOcean, Xindao…) detrás
 * de nuestro propio dominio. La URL pública pasa de
 *   https://cdn1.midocean.com/image/700X700/mo2763-03.jpg
 * a
 *   /api/media?u=<urlEncoded>&s=<hmac>
 *
 * Diseño:
 *   - Whitelist de hosts permitidos para evitar ser open proxy.
 *   - Firma HMAC sobre la URL para que no sirvamos como proxy general:
 *     solo URLs que el server haya construido con proxyImageUrl().
 *   - Cache 1 año (assets inmutables, los CDN proveedor cambian con sufijo
 *     en path así que rev cache invalida automático).
 */

const ALLOWED_HOSTS = new Set([
  "cdn1.midocean.com",
  "cdn1.midocean.com",
  "printposition-img-api-v2.cdn.midocean.com",
  "cdn.midocean.com",
  "images.xindao.eu",
  "assets.xindao.com",
]);

// Hoy resuelve a ADMIN_SECRET (MEDIA_PROXY_SECRET no está puesta), así que
// esto no cambia ninguna firma viva. Lo que quita es el literal "fallback":
// sin él, quedarse sin secreto convertía esto en un proxy firmable por
// cualquiera, y lo que se filtraría por ahí son las URLs de los CDN de
// proveedor, que es justo lo que este proxy existe para ocultar.
function getSecret(): string | null {
  return resolveSigningSecret({
    candidates: [process.env.MEDIA_PROXY_SECRET, process.env.ADMIN_SECRET],
    devFallback: "dev-only-media-proxy-secret",
  });
}

function sign(url: string, secret: string): string {
  return createHmac("sha256", secret).update(url).digest("base64url");
}

function verify(url: string, sig: string): boolean {
  if (!sig) return false;
  const secret = getSecret();
  if (!secret) return false;
  const expected = sign(url, secret);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u");
  const s = url.searchParams.get("s") || "";

  if (!u) return new Response("Falta u", { status: 400 });

  // Decode + verify
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("URL inválida", { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(target.host)) {
    return new Response("Host no permitido", { status: 403 });
  }

  if (!verify(u, s)) {
    return new Response("Firma inválida", { status: 403 });
  }

  // Fetch upstream con UA real
  let upstream: Response;
  try {
    upstream = await fetch(u, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TodoMerchandising/1.0)",
        Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
      },
      // Endpoint público cacheado: un upstream lento podría retener sockets/
      // workers del contenedor. Timeout corto para liberar. (bug-bounty 2026-06-17)
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new Response("Error red upstream", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response("Upstream " + upstream.status, { status: 502 });
  }

  const ct = upstream.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) {
    return new Response("Upstream no es imagen", { status: 502 });
  }

  // Límite de tamaño: una imagen legítima no supera ~12 MB. Sin esto, un
  // upstream que sirva un fichero enorme carga todo en RAM y puede tumbar el
  // contenedor (OOM). Pre-check por Content-Length + backstop tras leer.
  const MAX_BYTES = 12 * 1024 * 1024;
  const declaredLen = Number(upstream.headers.get("content-length") || 0);
  if (declaredLen > MAX_BYTES) {
    return new Response("Imagen demasiado grande", { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new Response("Imagen demasiado grande", { status: 502 });
  }
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(buf.byteLength),
      "X-Proxy": "todomerch-media-v1",
    },
  });
}

