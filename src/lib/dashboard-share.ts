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
import { resolveSigningSecret } from "./signing-secret";

/**
 * El secreto sale de DASHBOARD_SHARE_SECRET, y si no de NEXTAUTH_SECRET o
 * ADMIN_SECRET. Sin ninguno, en producción no se firma ni se verifica nada.
 *
 * Aquí el fallo abierto era peor que en `proposal-token`: aquel al menos
 * exigía acertar un cuid, pero un token de dashboard es `scope.expiry.firma`
 * y `scope` solo puede valer "summary" o "full" ⇒ con el literal público
 * bastaba para firmarse un enlace válido al dashboard entero, sin adivinar
 * nada. Verificado contra producción antes de arreglarlo: devolvía 200.
 */
function getSecret(): string | null {
  return resolveSigningSecret({
    candidates: [
      process.env.DASHBOARD_SHARE_SECRET,
      process.env.NEXTAUTH_SECRET,
      process.env.ADMIN_SECRET,
    ],
    devFallback: "dev-share-secret-do-not-use-in-prod",
  });
}

export type ShareScope = "summary" | "full";

function hmac(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64url");
}

export function signShareToken(scope: ShareScope, expiresInDays = 30): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "[dashboard-share] Sin DASHBOARD_SHARE_SECRET / NEXTAUTH_SECRET / ADMIN_SECRET: no se firman enlaces de dashboard en producción.",
    );
  }
  const expiry = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 3600;
  const payload = `${scope}.${expiry}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyShareToken(
  token: string,
): { valid: true; scope: ShareScope; expiry: number } | { valid: false; reason: string } {
  const secret = getSecret();
  if (!secret) return { valid: false, reason: "not-configured" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [scopeRaw, expiryStr, sig] = parts;
  if (scopeRaw !== "summary" && scopeRaw !== "full") {
    return { valid: false, reason: "bad-scope" };
  }
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { valid: false, reason: "bad-expiry" };
  // Mismo detalle que en proposal-token: la firma se comprueba contra el
  // expiry ya parseado, así que sin exigir la forma canónica `<scope>.<n>XYZ`
  // verificaría igual que el token legítimo.
  if (String(expiry) !== expiryStr) return { valid: false, reason: "bad-expiry" };
  if (expiry < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "expired" };
  }
  const expected = hmac(`${scopeRaw}.${expiry}`, secret);
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
