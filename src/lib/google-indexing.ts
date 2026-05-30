import { SignJWT, importPKCS8 } from "jose";

/**
 * Cliente ligero para Google Indexing API. Firma JWT con la service
 * account, intercambia por access token, y publica notificaciones de
 * URL_UPDATED a Google.
 *
 * Setup requerido (una sola vez):
 *  1. Crear service account en https://console.cloud.google.com
 *  2. Habilitar Indexing API en GCP
 *  3. En Search Console, añadir el email de la SA como Owner
 *     (Settings → Users and permissions → Add user)
 *  4. Pegar las credenciales (client_email, private_key) en .env:
 *       GOOGLE_INDEXING_CLIENT_EMAIL=...iam.gserviceaccount.com
 *       GOOGLE_INDEXING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *
 * NOTA: la private_key necesita los \n literales (Coolify env quoting
 * suele tolerar bien las multilíneas dentro de comillas).
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

let cachedToken: { token: string; expiresAt: number } | null = null;

function getCreds() {
  const email = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  // Coolify suele entregar la clave con \n literales — los convertimos a saltos reales.
  const rawKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  const privateKey = rawKey?.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  if (!email || !privateKey) {
    throw new Error(
      "Google Indexing API no configurada (faltan GOOGLE_INDEXING_CLIENT_EMAIL o GOOGLE_INDEXING_PRIVATE_KEY)",
    );
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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google OAuth token request failed: ${res.status} ${txt}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type IndexingResult = {
  url: string;
  ok: boolean;
  error?: string;
};

/**
 * Notifica a Google que las URLs deben re-crawlearse (tipo URL_UPDATED).
 * Llama 1 vez por URL — la API no soporta batch en este endpoint.
 * Cuota free tier: 200 req/día.
 */
export async function notifyGoogleIndexing(
  urls: string[],
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED",
): Promise<IndexingResult[]> {
  const token = await getAccessToken();
  const results: IndexingResult[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(INDEXING_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type }),
      });
      if (!res.ok) {
        const txt = await res.text();
        results.push({ url, ok: false, error: `${res.status}: ${txt.slice(0, 200)}` });
      } else {
        results.push({ url, ok: true });
      }
    } catch (e) {
      results.push({
        url,
        ok: false,
        error: e instanceof Error ? e.message : "unknown error",
      });
    }
  }
  return results;
}

export function isGoogleIndexingConfigured(): boolean {
  return !!(
    process.env.GOOGLE_INDEXING_CLIENT_EMAIL &&
    process.env.GOOGLE_INDEXING_PRIVATE_KEY
  );
}
