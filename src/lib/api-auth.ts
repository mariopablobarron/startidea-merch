import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Auth para la API pública (header `Authorization: Bearer <key>`).
 *
 * Formato del key: `merch_live_<8-char-prefix>_<24-char-secret>`
 *   - prefix sirve para identificar la key en logs/DB sin exponer el secreto
 *   - secret se compara con SHA-256(secret) almacenado en `ApiKey.secretHash`
 *
 * Generación: createApiKey() devuelve {plain, prefix, hash} — entregar plain
 * UNA VEZ al cliente y guardar prefix+hash. No se puede recuperar plain.
 */

export type AuthResult =
  | { ok: true; keyId: string; label: string; scopes: string[] }
  | { ok: false; status: number; reason: string };

const PREFIX_TAG = "merch_live_";

export function createApiKey(): { plain: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString("hex"); // 8 chars
  const secret = randomBytes(18).toString("base64url"); // ~24 chars
  const plain = `${PREFIX_TAG}${prefix}_${secret}`;
  const hash = sha256(plain);
  return { plain, prefix, hash };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function authenticateApiKey(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(\S+)$/);
  if (!m) return { ok: false, status: 401, reason: "Authorization header missing or malformed" };
  const plain = m[1];
  if (!plain.startsWith(PREFIX_TAG)) {
    return { ok: false, status: 401, reason: "Invalid key format" };
  }
  const middle = plain.slice(PREFIX_TAG.length);
  const idx = middle.indexOf("_");
  if (idx < 0) return { ok: false, status: 401, reason: "Invalid key format" };
  const prefix = middle.slice(0, idx);

  const key = await prisma.apiKey.findUnique({ where: { keyPrefix: prefix } });
  if (!key || !key.active) return { ok: false, status: 401, reason: "Key inválida o inactiva" };

  if (sha256(plain) !== key.secretHash) {
    return { ok: false, status: 401, reason: "Key inválida" };
  }

  // Update lastUsedAt fire-and-forget
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, keyId: key.id, label: key.label, scopes: key.scopes };
}

export function requireScope(auth: AuthResult, scope: string): AuthResult {
  if (!auth.ok) return auth;
  if (auth.scopes.length === 0) return auth; // sin scopes = todo permitido (compat)
  if (!auth.scopes.includes(scope)) {
    return { ok: false, status: 403, reason: `Falta scope: ${scope}` };
  }
  return auth;
}
