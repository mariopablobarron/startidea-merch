import { createHmac, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function cookieValue(req: Request, name: string): string | null {
  // Parseo sin RegExp dinámica (evita el falso positivo ReDoS de semgrep y es
  // más directo): partimos por ';' y buscamos la cookie por nombre exacto.
  const cookieHeader = req.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function verifyLegacyAdminCookie(token: string): boolean {
  const secret = process.env.ADMIN_SECRET || "";
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expStr, sig] = parts;
  if (version !== "v1") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  const expected = createHmac("sha256", secret).update(`${version}.${expStr}`).digest("base64url");
  return safeEqual(sig, expected);
}

function verifyJwtCookie(token: string): boolean {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET || "";
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
      alg?: string;
    };
    if (header.alg !== "HS256") return false;

    const expected = createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (!safeEqual(sig, expected)) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp?: number;
      userId?: string;
      email?: string;
    };
    if (payload.exp && Date.now() / 1000 > payload.exp) return false;
    return Boolean(payload.userId && payload.email);
  } catch {
    return false;
  }
}

/**
 * Compatibilidad: acepta X-Admin-Secret legacy O cookie de sesión admin
 * (cualquier rol). Para protección por rol específico, usar
 * requireRole() de @/lib/admin-auth en lugar de requireAdminSecret.
 */
export function requireAdminSecret(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.ADMIN_SECRET;
  // 1. X-Admin-Secret legacy (compat APIs externas y curl). Solo por HEADER:
  // el fallback ?secret= en la URL filtraba la credencial a logs de acceso,
  // historial del navegador y cabecera Referer (CWE-598). Verificado que
  // nada legítimo lo usaba por query (auditoría 2026-07-15).
  if (secret) {
    const provided = req.headers.get("x-admin-secret") ?? "";
    if (provided && safeEqual(provided, secret)) return { ok: true };
  }
  // 2. Cookie de sesión admin verificada (JWT actual o HMAC legacy).
  const token = cookieValue(req, "merch_admin");
  if (token && (verifyJwtCookie(token) || verifyLegacyAdminCookie(token))) return { ok: true };
  return { ok: false, status: 401, reason: "No autenticado" };
}

export function requireCronSecret(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, reason: "CRON_SECRET no configurado" };
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!provided) return { ok: false, status: 401, reason: "missing secret" };
  if (!safeEqual(provided, secret)) return { ok: false, status: 403, reason: "bad secret" };
  return { ok: true };
}
