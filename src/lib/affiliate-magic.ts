/**
 * Magic-link para que cada afiliado consulte su saldo + ledger en
 * `/afiliado/[token]` (read-only). 30 días de validez por token.
 *
 * Patrón idéntico a customer-auth: HS256, secret compartido por defecto
 * con CUSTOMER_JWT_SECRET / ADMIN_JWT_SECRET / ADMIN_SECRET.
 *
 * NO permite operar (canjear, modificar). Para canjes el afiliado contacta
 * con Mario y este los registra desde /admin/affiliates/[id] (F3 admin).
 */
import { SignJWT, jwtVerify } from "jose";

const secret = (() => {
  const s =
    process.env.AFFILIATE_JWT_SECRET ||
    process.env.CUSTOMER_JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_SECRET ||
    "";
  if (!s) return null;
  return new TextEncoder().encode(s);
})();

export type AffiliateMagicPayload = { partnerId: string };

export async function signAffiliateMagicToken(
  partnerId: string,
  ttl: string = "30d",
): Promise<string> {
  if (!secret) throw new Error("AFFILIATE_JWT_SECRET no configurado");
  return new SignJWT({ partnerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

export async function verifyAffiliateMagicToken(
  token: string,
): Promise<AffiliateMagicPayload | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const partnerId = String(payload.partnerId || "");
    if (!partnerId) return null;
    return { partnerId };
  } catch {
    return null;
  }
}
