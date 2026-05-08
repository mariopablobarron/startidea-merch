import { createHmac } from "node:crypto";

/**
 * Helpers server-side para reescribir URLs de imágenes que vienen de CDN
 * de proveedores hacia nuestro proxy /api/media. Esto oculta cdn1.midocean.com,
 * printposition-img-api-v2.cdn.midocean.com y otros del HTML público.
 *
 * Las funciones devuelven null/string limpio según el caso. Si la URL no
 * matchea ningún host de proveedor (ej. ya es interna /uploads/...,
 * extraImage de admin, o URL externa pública como Cloudinary), se devuelve
 * tal cual sin proxy.
 */

const PROVIDER_HOSTS = new Set([
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

/**
 * Reescribe una URL de imagen para que pase por nuestro proxy si es de
 * un proveedor conocido. Devuelve null si la entrada es null/empty/inválida.
 *
 * Llamar SIEMPRE desde server components o server actions — NO desde client.
 */
export function proxyImageUrl(original: string | null | undefined): string | null {
  if (!original || typeof original !== "string") return null;
  const trimmed = original.trim();
  if (!trimmed) return null;

  // Si ya es URL relativa propia, devolver tal cual
  if (trimmed.startsWith("/")) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed; // texto malformado → devolver para que el browser intente
  }

  // Si NO es un host de proveedor, no proxiar (puede ser CDN propio o
  // imagen externa que el admin pegó)
  if (!PROVIDER_HOSTS.has(parsed.host)) {
    return trimmed;
  }

  // URL de proveedor → proxiar
  return `/api/media?u=${encodeURIComponent(trimmed)}&s=${sign(trimmed)}`;
}

/**
 * Versión absoluta del proxy URL (con dominio) — para OG image en metadata.
 */
export function absoluteProxyImageUrl(
  original: string | null | undefined,
  siteUrl?: string,
): string | null {
  const rel = proxyImageUrl(original);
  if (!rel) return null;
  if (rel.startsWith("http")) return rel;
  const base = siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
  return `${base.replace(/\/$/, "")}${rel}`;
}
