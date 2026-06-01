import crypto from "node:crypto";

/**
 * HMAC token para autorizar la descarga del PDF de una propuesta.
 *
 * Estructura: <proposalId>.<expiryUnixSec>.<hmacSha256>
 *
 * El secret viene de PROPOSAL_SIGN_SECRET (env). Si no está, fallback
 * a NEXTAUTH_SECRET o un literal de dev. En producción siempre debe
 * estar — el deploy fallaría visible si no.
 *
 * Expiración: 30 días desde issue. Si caduca, regenerar nuevo token
 * desde el endpoint admin /admin/propuestas (próxima fase).
 */
const SECRET =
  process.env.PROPOSAL_SIGN_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "dev-only-proposal-secret-do-not-use-in-prod";

const TTL_SECONDS = 30 * 24 * 3600; // 30 días

function hmac(message: string): string {
  return crypto.createHmac("sha256", SECRET).update(message).digest("base64url");
}

export function signProposalToken(proposalId: string, now: Date = new Date()): string {
  const expiry = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
  const sig = hmac(`${proposalId}.${expiry}`);
  return `${proposalId}.${expiry}.${sig}`;
}

export function verifyProposalToken(
  token: string,
  now: Date = new Date(),
): { valid: true; proposalId: string } | { valid: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [proposalId, expiryStr, sig] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { valid: false, reason: "bad-expiry" };
  if (expiry < Math.floor(now.getTime() / 1000)) {
    return { valid: false, reason: "expired" };
  }
  const expected = hmac(`${proposalId}.${expiry}`);
  // timingSafeEqual requiere buffers del mismo tamaño
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return { valid: false, reason: "bad-signature" };
  }
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad-signature" };
  }
  return { valid: true, proposalId };
}
