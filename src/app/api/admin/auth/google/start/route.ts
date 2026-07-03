import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

/**
 * Inicio del login con Google (OAuth 2.0, Authorization Code).
 *
 * Genera state (CSRF) + nonce (anti-replay del id_token), los guarda en cookies
 * HttpOnly temporales y redirige a la pantalla de consentimiento de Google. El
 * callback verifica ambos. NO crea sesión aquí — solo autoriza al usuario a ir
 * a Google. La autorización real (¿es admin?) se decide en /callback.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const REDIRECT_URI = `${SITE_URL}/api/admin/auth/google/callback`;

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${SITE_URL}/admin/login?error=google_no_config`);
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
    access_type: "online",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min para completar el flujo
  };
  res.cookies.set("g_oauth_state", state, opts);
  res.cookies.set("g_oauth_nonce", nonce, opts);
  return res;
}
