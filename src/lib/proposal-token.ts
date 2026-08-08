import crypto from "node:crypto";
import { resolveSigningSecret } from "./signing-secret";

/**
 * HMAC token para autorizar la descarga del PDF de una propuesta.
 *
 * Estructura: <proposalId>.<expiryUnixSec>.<hmacSha256>
 *
 * El secret viene de PROPOSAL_SIGN_SECRET, y si no NEXTAUTH_SECRET o
 * ADMIN_SECRET. En producción, si no hay ninguno, NO se firma y NO se
 * verifica nada: este token es lo único que separa a un desconocido del PDF
 * con los precios del cliente y del botón que acepta la propuesta en su
 * nombre, así que tiene que fallar cerrado.
 *
 * El literal de desarrollo solo se usa fuera de producción. Durante un tiempo
 * se usó TAMBIÉN en producción —ninguna de las dos envs existía— y es una
 * cadena que está en un repositorio público: cualquiera que la leyese podía
 * firmarse enlaces válidos.
 *
 * Expiración: 30 días desde issue. Si caduca, regenerar nuevo token
 * desde el endpoint admin /admin/propuestas (próxima fase).
 */
function getSecret(): string | null {
  return resolveSigningSecret({
    candidates: [
      process.env.PROPOSAL_SIGN_SECRET,
      process.env.NEXTAUTH_SECRET,
      process.env.ADMIN_SECRET,
    ],
    devFallback: "dev-only-proposal-secret-do-not-use-in-prod",
  });
}

const TTL_SECONDS = 30 * 24 * 3600; // 30 días

function hmac(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64url");
}

export function signProposalToken(proposalId: string, now: Date = new Date()): string {
  const secret = getSecret();
  if (!secret) {
    // Preferible a emitir un enlace que parece seguro y no lo es.
    throw new Error(
      "[proposal-token] Sin PROPOSAL_SIGN_SECRET / NEXTAUTH_SECRET / ADMIN_SECRET: no se firman enlaces de propuesta en producción.",
    );
  }
  const expiry = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
  const sig = hmac(`${proposalId}.${expiry}`, secret);
  return `${proposalId}.${expiry}.${sig}`;
}

export function verifyProposalToken(
  token: string,
  now: Date = new Date(),
): { valid: true; proposalId: string } | { valid: false; reason: string } {
  const secret = getSecret();
  // Sin secreto real en producción no hay nada que podamos dar por válido.
  if (!secret) return { valid: false, reason: "not-configured" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [proposalId, expiryStr, sig] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { valid: false, reason: "bad-expiry" };
  // La firma se calcula sobre el expiry YA PARSEADO, así que sin esta
  // comprobación `<id>.1788603470XYZ.<firma>` verificaría igual que el token
  // legítimo (parseInt se come el sufijo). No permite alargar la caducidad ni
  // cambiar de propuesta —ambas van firmadas—, pero admite infinitas variantes
  // válidas del mismo token, y eso rompería cualquier revocación o registro que
  // compare tokens por igualdad. Exigimos la forma canónica: los emitidos por
  // signProposalToken siempre la tienen, así que no invalida ninguno vivo.
  if (String(expiry) !== expiryStr) return { valid: false, reason: "bad-expiry" };
  if (expiry < Math.floor(now.getTime() / 1000)) {
    return { valid: false, reason: "expired" };
  }
  const expected = hmac(`${proposalId}.${expiry}`, secret);
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
