import { createHmac, timingSafeEqual } from "node:crypto";

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

const SECRET = process.env.MEDIA_PROXY_SECRET || process.env.ADMIN_SECRET || "fallback";

function sign(url: string): string {
  return createHmac("sha256", SECRET).update(url).digest("base64url");
}

function verify(url: string, sig: string): boolean {
  if (!sig) return false;
  const expected = sign(url);
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

  const buf = await upstream.arrayBuffer();
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

