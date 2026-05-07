/**
 * Compat shim — antes este módulo era el sistema de auth admin (HMAC simple).
 * Sprint 23 introdujo admin-auth.ts con JWT firmado HS256 y roles RBAC,
 * usando la MISMA cookie 'merch_admin'. Si dos verificadores comprueban
 * la misma cookie con formatos distintos, uno fallaba siempre y rompía
 * páginas como /admin/quotes.
 *
 * Solución: este módulo ahora delega en getAdminSession() para que las
 * páginas legacy que llaman isAdmin() acepten también la cookie JWT nueva.
 *
 * setAdminSession() y clearAdminSession() siguen exportados para no
 * romper el endpoint legacy de login (si aún existe), pero los nuevos
 * flujos usan signSession() de admin-auth.ts directamente.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/admin-auth";

const COOKIE = "merch_admin";
const TTL_SECONDS = 8 * 60 * 60;

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s) throw new Error("ADMIN_SECRET no configurado");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function buildLegacy(expEpoch: number) {
  const payload = `v1.${expEpoch}`;
  return `${payload}.${sign(payload)}`;
}

/** @deprecated set sesión legacy HMAC; usar signSession() de admin-auth */
export async function setAdminSession() {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const c = await cookies();
  c.set(COOKIE, buildLegacy(exp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  const c = await cookies();
  c.delete(COOKIE);
}

/**
 * Comprueba si hay sesión admin activa, aceptando tanto el formato JWT nuevo
 * como el HMAC legacy. Esto permite que páginas como /admin/quotes funcionen
 * tras el login con email+password (que devuelve JWT).
 */
export async function isAdmin(): Promise<boolean> {
  // 1. Sesión JWT nueva (Sprint 23) — el caso normal
  const session = await getAdminSession();
  if (session) return true;

  // 2. Fallback a HMAC legacy por si quedan cookies antiguas
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expStr, sig] = parts;
  if (v !== "v1") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  try {
    const expected = sign(`${v}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function requireAdminPage(): Promise<boolean> {
  return isAdmin();
}

export function checkAdminSecret(provided: string): boolean {
  const s = process.env.ADMIN_SECRET || "";
  if (!s || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(s);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
