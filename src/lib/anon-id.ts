/**
 * Helper para obtener un anonId estable por visitante.
 *
 * Usa cookie httpOnly de 1 año. No es PII — solo un hash aleatorio
 * para clustering de eventos del mismo visitor (A/B, tracking).
 *
 * Server component-safe (usa cookies() de Next.js).
 */
import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "anon_id";
const TTL_DAYS = 365;

export async function getOrCreateAnonId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE);
  if (existing?.value && /^[a-zA-Z0-9_-]{12,64}$/.test(existing.value)) {
    return existing.value;
  }
  const id = crypto.randomBytes(16).toString("base64url");
  try {
    store.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: TTL_DAYS * 24 * 3600,
      path: "/",
    });
  } catch {
    // server components readonly puede tirar — devolvemos el id igualmente
    // (la próxima vista lo cookieará)
  }
  return id;
}
