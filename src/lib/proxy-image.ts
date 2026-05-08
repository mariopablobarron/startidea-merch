import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Mapeo opaco URL ↔ hash para ocultar totalmente el CDN del proveedor.
 *
 * El cliente público solo ve URLs como `/api/m/Q2X9F7K3M2P5R8N4` — sin
 * indicio del proveedor real. El endpoint busca el hash en la tabla
 * MediaAsset, hace fetch a originalUrl y devuelve la imagen.
 *
 * Hash: SHA-1(originalUrl) → 16 chars base32 sin ambigüedad (no 0/O,1/I/L).
 * Determinístico — la misma URL siempre produce el mismo hash, así no se
 * generan duplicados.
 */

const PROVIDER_HOSTS = new Set([
  "cdn1.midocean.com",
  "printposition-img-api-v2.cdn.midocean.com",
  "cdn.midocean.com",
  "images.xindao.eu",
  "assets.xindao.com",
]);

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars sin ambiguos

/**
 * Calcula el hash determinístico para una URL. No requiere DB.
 * 16 chars base32 = 80 bits. Para 100k assets: probabilidad colisión <1e-12.
 */
export function mediaHash(originalUrl: string): string {
  const sha = createHash("sha1").update(originalUrl).digest();
  let bits = 0n;
  for (let i = 0; i < 10; i++) bits = (bits << 8n) | BigInt(sha[i]);
  let s = "";
  const len = BigInt(ALPHABET.length);
  for (let i = 0; i < 16; i++) {
    const idx = Number((bits & 31n) % len);
    s = ALPHABET[idx] + s;
    bits >>= 5n;
  }
  return s;
}

function isProviderHost(url: string): boolean {
  try {
    return PROVIDER_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

/**
 * Versión SÍNCRONA — calcula el hash sin tocar BD. Asume que MediaAsset
 * ya existe (creado por sync de MidOcean o backfill). Si no existe,
 * el endpoint /api/m/[hash] devolverá 404.
 *
 * Si la URL no es de proveedor, devuelve la URL tal cual (CDN propio,
 * Cloudinary, etc. publica directa).
 *
 * Llamar SIEMPRE desde server components — necesita Node crypto.
 */
export function proxyImageUrl(original: string | null | undefined): string | null {
  if (!original || typeof original !== "string") return null;
  const trimmed = original.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (!isProviderHost(trimmed)) return trimmed;
  return `/api/m/${mediaHash(trimmed)}`;
}

/**
 * Versión ASYNC — además del cálculo, hace upsert en MediaAsset para que
 * el endpoint pueda resolver el hash. Usar en sync de proveedores y al
 * guardar overrides admin (extraImages).
 */
export async function ensureMediaAsset(
  originalUrl: string | null | undefined,
  kind?: string,
): Promise<string | null> {
  if (!originalUrl) return null;
  if (!isProviderHost(originalUrl)) return originalUrl.trim() || null;
  const hash = mediaHash(originalUrl);
  await prisma.mediaAsset
    .upsert({
      where: { hash },
      update: {}, // no-op si ya existe (originalUrl no cambia)
      create: { hash, originalUrl, kind },
    })
    .catch(() => {});
  return `/api/m/${hash}`;
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
