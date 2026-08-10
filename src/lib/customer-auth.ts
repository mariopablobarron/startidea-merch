import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "merch_customer";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const secret = (() => {
  const s = process.env.CUSTOMER_JWT_SECRET || process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET || "";
  if (!s) return null;
  return new TextEncoder().encode(s);
})();

export type CustomerSession = { userId: string; email: string; name: string };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signCustomerSession(s: CustomerSession): Promise<string> {
  if (!secret) throw new Error("CUSTOMER_JWT_SECRET no configurado");
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyCustomerSession(token: string): Promise<CustomerSession | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = String(payload.userId || "");
    const email = String(payload.email || "");
    // Fail-closed: un token bien FIRMADO pero sin estos claims no es una
    // sesión de cliente. Importa porque, mientras no existan sus secretos
    // propios, los tres tipos de token (admin, cliente, afiliado) se firman
    // con el mismo ADMIN_SECRET ⇒ un token de otro tipo supera el jwtVerify.
    // Sin este corte devolvía {userId:"", email:""}, que es TRUTHY y pasa
    // cualquier `if (!session) return 401`. Hoy eso solo abre un portal
    // vacío (todo se filtra por email y no hay fila con email ""), pero deja
    // el control de /reorder y /invoice —que comparan cart.email con
    // session.email— dependiendo de que ese vacío nunca ocurra.
    // `name` NO se exige: CustomerUser.name es opcional y firmarlo vacío es
    // legítimo. Solo se exige lo que identifica al cliente.
    if (!userId || !email) return null;
    return { userId, email, name: String(payload.name || "") };
  } catch {
    return null;
  }
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifyCustomerSession(token);
}

export function customerCookieValue(token: string): string {
  return [
    `${COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCustomerCookieValue(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function authenticateCustomerRequest(req: Request): Promise<CustomerSession | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const m = cookieHeader.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verifyCustomerSession(decodeURIComponent(m[1]));
}

/** Usuario por email (busca o crea uno passwordless si tiene CartQuotes con ese email). */
export async function findOrCreateCustomerByEmail(email: string, name?: string) {
  const lower = email.toLowerCase();
  let user = await prisma.customerUser.findUnique({ where: { email: lower } });
  if (user) return user;
  // Si tiene un cart asociado, lo creamos
  const anyCart = await prisma.cartQuote.findFirst({
    where: { email: lower },
    select: { name: true, company: true },
  });
  if (!anyCart) return null;
  user = await prisma.customerUser.create({
    data: {
      email: lower,
      name: name || anyCart.name,
      company: anyCart.company,
    },
  });
  return user;
}
