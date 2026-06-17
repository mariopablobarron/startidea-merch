import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — una imagen legítima no lo supera

/**
 * Defensa SSRF (defensa en profundidad): originalUrl SIEMPRE lo escribe
 * ensureMediaAsset con URLs de CDN de proveedor, pero bloqueamos hosts
 * internos/privados por si entrara una fila por otra vía. (bug-bounty 2026-06-17)
 */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

/**
 * Resuelve un hash opaco → fetcha la imagen del proveedor → devuelve.
 * El cliente público nunca ve la URL del CDN proveedor.
 *
 * Si el hash no está en MediaAsset, 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!hash || hash.length < 8 || hash.length > 32) {
    return new Response("Hash inválido", { status: 400 });
  }

  const asset = await prisma.mediaAsset.findUnique({ where: { hash } });
  if (!asset) {
    return new Response("Asset no encontrado", { status: 404 });
  }

  let target: URL;
  try {
    target = new URL(asset.originalUrl);
  } catch {
    return new Response("URL de asset inválida", { status: 502 });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return new Response("Host de asset no permitido", { status: 502 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(asset.originalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TodoMerchandising/1.0)",
        Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
      },
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

  if (Number(upstream.headers.get("content-length") || 0) > MAX_BYTES) {
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
      "X-Proxy": "media-v2",
    },
  });
}
