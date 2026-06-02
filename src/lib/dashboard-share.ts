/**
 * Genera URLs firmadas con HMAC para compartir vistas read-only del
 * dashboard con personas que NO son admin (socios, inversores, clientes
 * B2B premium).
 *
 * Token = scope.expiry.signature(base64url)
 *
 * Scope:
 *   - summary  → solo KPIs principales (funnel + salud catálogo)
 *   - full     → todo menos acciones one-click y secrets
 */
import crypto from "node:crypto";

const SECRET =
  process.env.DASHBOARD_SHARE_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "dev-share-secret-do-not-use-in-prod";

export type ShareScope = "summary" | "full";

function hmac(message: string): string {
  return crypto.createHmac("sha256", SECRET).update(message).digest("base64url");
}

export function signShareToken(scope: ShareScope, expiresInDays = 30): string {
  const expiry = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 3600;
  const payload = `${scope}.${expiry}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyShareToken(
  token: string,
): { valid: true; scope: ShareScope; expiry: number } | { valid: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [scopeRaw, expiryStr, sig] = parts;
  if (scopeRaw !== "summary" && scopeRaw !== "full") {
    return { valid: false, reason: "bad-scope" };
  }
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { valid: false, reason: "bad-expiry" };
  if (expiry < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "expired" };
  }
  const expected = hmac(`${scopeRaw}.${expiry}`);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return { valid: false, reason: "bad-signature" };
  }
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad-signature" };
  }
  return { valid: true, scope: scopeRaw, expiry };
}
