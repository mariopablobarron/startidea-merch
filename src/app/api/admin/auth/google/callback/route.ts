import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { signSession, findAdminUserByEmail } from "@/lib/admin-auth";

/**
 * Callback del login con Google. Verifica todo antes de crear sesión:
 *   1. state coincide con la cookie (anti-CSRF).
 *   2. Intercambia el code por tokens (canal server-to-server).
 *   3. Verifica la FIRMA del id_token contra las claves públicas de Google
 *      (JWKS) + issuer + audience (nuestro client_id) con `jose`.
 *   4. email_verified === true y nonce coincide (anti-replay).
 *   5. El email debe ser un AdminUser ACTIVO — si no, se rechaza. El login con
 *      Google NUNCA crea usuarios ni concede acceso a un Gmail no autorizado.
 * Solo entonces firma la sesión (mismo JWT que el login por contraseña) con el
 * rol del AdminUser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const REDIRECT_URI = `${SITE_URL}/api/admin/auth/google/callback`;
const SESSION_MAX_AGE = 8 * 60 * 60; // 8h, igual que signSession

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function fail(reason: string) {
  const res = NextResponse.redirect(`${SITE_URL}/admin/login?error=${encodeURIComponent(reason)}`);
  // Limpia las cookies temporales del flujo en cualquier salida
  res.cookies.set("g_oauth_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("g_oauth_nonce", "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const savedState = store.get("g_oauth_state")?.value;
  const savedNonce = store.get("g_oauth_nonce")?.value;

  // 1. Anti-CSRF
  if (!code || !state || !savedState || state !== savedState) return fail("google_state");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("google_no_config");

  // 2. Code → tokens
  let idToken: string | undefined;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("google_token");
    const tokens = (await tokenRes.json()) as { id_token?: string };
    idToken = tokens.id_token;
  } catch {
    return fail("google_token");
  }
  if (!idToken) return fail("google_token");

  // 3. Verificar firma + iss + aud del id_token
  let email = "";
  let name = "";
  let emailVerified = false;
  let nonce: string | undefined;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    email = String(payload.email || "").toLowerCase();
    name = String(payload.name || email);
    emailVerified = payload.email_verified === true;
    nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
  } catch {
    return fail("google_verify");
  }

  // 4. email verificado + nonce
  if (!email || !emailVerified) return fail("google_email");
  if (!savedNonce || nonce !== savedNonce) return fail("google_nonce");

  // 5. El email DEBE ser un AdminUser activo — puerta de autorización
  const admin = await findAdminUserByEmail(email);
  if (!admin || !admin.active) return fail("no_autorizado");

  // Sesión (mismo JWT que el login por contraseña) con el rol del AdminUser
  const token = await signSession({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });
  await prisma.adminUser
    .update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  const res = NextResponse.redirect(`${SITE_URL}/admin`);
  res.cookies.set("merch_admin", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.set("g_oauth_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("g_oauth_nonce", "", { path: "/", maxAge: 0 });
  return res;
}
