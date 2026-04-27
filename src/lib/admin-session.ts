/**
 * Sesión admin minimalista — cookie HttpOnly firmada con HMAC sobre el ADMIN_SECRET.
 * Sin librería externa: vence en 8 h y se invalida si cambia el secret.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

function build(expEpoch: number) {
  const payload = `v1.${expEpoch}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token: string): { ok: true } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [v, expStr, sig] = parts;
  if (v !== "v1") return { ok: false };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return { ok: false };
  const expected = sign(`${v}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false };
  if (!timingSafeEqual(a, b)) return { ok: false };
  return { ok: true };
}

export async function setAdminSession() {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const c = await cookies();
  c.set(COOKIE, build(exp), {
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

export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return false;
  return verify(token).ok;
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
