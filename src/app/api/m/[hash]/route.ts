import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let upstream: Response;
  try {
    upstream = await fetch(asset.originalUrl, {
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
      "X-Proxy": "media-v2",
    },
  });
}
