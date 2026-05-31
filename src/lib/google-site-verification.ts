import { SignJWT, importPKCS8 } from "jose";

/**
 * Cliente de Google Site Verification API. Permite que una service account
 * verifique propiedad de un dominio mediante DNS TXT record.
 *
 * Flujo (DNS_TXT método para Domain property):
 *  1. getVerificationToken({identifier: "merchandising.hubstartidea.es", type: "INET_DOMAIN"})
 *     → devuelve un token tipo "google-site-verification=XXXXX"
 *  2. Añadir TXT record en DNS del dominio con ese valor
 *  3. insertWebResource({identifier, type: "INET_DOMAIN", verificationMethod: "DNS_TXT"})
 *     → Google verifica el TXT y la SA queda como verified owner
 */

const SCOPE = "https://www.googleapis.com/auth/siteverification";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken: { token: string; expiresAt: number } | null = null;

function getCreds() {
  const email = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  const privateKey = rawKey?.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  if (!email || !privateKey) {
    throw new Error("GOOGLE_INDEXING_* envs missing");
  }
  return { email, privateKey };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const { email, privateKey } = getCreds();
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type SiteIdentifier = {
  identifier: string;
  type: "INET_DOMAIN" | "SITE";
};

/** Solicita a Google un token de verificación. */
export async function getVerificationToken(
  site: SiteIdentifier,
  verificationMethod: "DNS_TXT" | "FILE" | "META",
): Promise<{ ok: boolean; status: number; token?: string; raw: unknown }> {
  const access = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/siteVerification/v1/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ verificationMethod, site }),
  });
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }
  const token = res.ok ? (raw as { token?: string }).token : undefined;
  return { ok: res.ok, status: res.status, token, raw };
}

/** Pide a Google que verifique la propiedad (debe haber TXT/FILE/META ya servido). */
export async function insertWebResource(
  site: SiteIdentifier,
  verificationMethod: "DNS_TXT" | "FILE" | "META",
): Promise<{ ok: boolean; status: number; raw: unknown }> {
  const access = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=${verificationMethod}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ site }),
    },
  );
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }
  return { ok: res.ok, status: res.status, raw };
}

/** Lista las propiedades verificadas por esta SA via Site Verification API. */
export async function listWebResources(): Promise<{
  ok: boolean;
  status: number;
  raw: unknown;
}> {
  const access = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/siteVerification/v1/webResource", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }
  return { ok: res.ok, status: res.status, raw };
}
