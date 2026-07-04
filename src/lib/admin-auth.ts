import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Auth de panel admin con roles. JWT firmado HS256, expira en 8 horas.
 * Cookie HttpOnly samesite-lax. Compatible con X-Admin-Secret legacy
 * (interpretado como rol CEO) para no romper APIs externas.
 */

const COOKIE = "merch_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const secret = (() => {
  const s = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET || "";
  if (!s) return null;
  return new TextEncoder().encode(s);
})();

export type AdminSession = { userId: string; email: string; name: string; role: AdminRole };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(session: AdminSession): Promise<string> {
  if (!secret) throw new Error("ADMIN_JWT_SECRET (o ADMIN_SECRET) no configurado");
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: String(payload.userId || ""),
      email: String(payload.email || ""),
      name: String(payload.name || ""),
      role: payload.role as AdminRole,
    };
  } catch {
    return null;
  }
}

/** Lee la sesión actual desde la cookie. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Authentica vía cookie JWT o vía X-Admin-Secret legacy (rol = CEO). */
export async function authenticateAdminRequest(req: Request): Promise<AdminSession | null> {
  // 1. JWT cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const m = cookieHeader.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (m) {
    const session = await verifySession(decodeURIComponent(m[1]));
    if (session) return session;
  }
  // 2. X-Admin-Secret legacy → asume CEO
  const legacy = req.headers.get("x-admin-secret");
  if (legacy && legacy === process.env.ADMIN_SECRET) {
    return {
      userId: "legacy-admin",
      email: "ceo@startidea.es",
      name: "CEO (legacy)",
      role: "CEO",
    };
  }
  return null;
}

/** Helper: requiere sesión activa. Devuelve session o {ok:false, reason}. */
export type AuthResult =
  | { ok: true; session: AdminSession }
  | { ok: false; status: number; reason: string };

export async function requireAdminSession(req: Request): Promise<AuthResult> {
  const s = await authenticateAdminRequest(req);
  if (!s) return { ok: false, status: 401, reason: "No autenticado" };
  return { ok: true, session: s };
}

/** Helper: requiere rol específico (o uno de varios). CEO siempre pasa. */
export async function requireRole(req: Request, ...allowed: AdminRole[]): Promise<AuthResult> {
  const result = await requireAdminSession(req);
  if (!result.ok) return result;
  if (result.session.role === "CEO") return result;
  if (allowed.includes(result.session.role)) return result;
  return { ok: false, status: 403, reason: `Requiere rol ${allowed.join("|")}` };
}

/** Crea cookie de sesión en la response (Set-Cookie). */
export function sessionCookieValue(token: string, maxAgeMs = SESSION_TTL_MS): string {
  return [
    `${COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookieValue(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Usuario admin desde la BD. */
export async function findAdminUserByEmail(email: string) {
  return prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
}

/**
 * Auditoría de accesos: registra el intento (éxito o rechazo) sin bloquear
 * nunca el flujo de login (fire-and-forget; los fallos de auditoría se tragan).
 */
export function recordLoginEvent(e: {
  email: string;
  method: "password" | "google";
  ok: boolean;
  reason?: string;
  req?: Request;
}): void {
  const ip = e.req
    ? e.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      e.req.headers.get("x-real-ip") ||
      null
    : null;
  const userAgent = e.req?.headers.get("user-agent")?.slice(0, 300) ?? null;
  void prisma.adminLoginEvent
    .create({
      data: {
        email: e.email.toLowerCase().slice(0, 200),
        method: e.method,
        ok: e.ok,
        reason: e.reason ?? null,
        ip,
        userAgent,
      },
    })
    .catch(() => {});
}
