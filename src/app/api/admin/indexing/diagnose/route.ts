import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { SignJWT, importPKCS8 } from "jose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Diagnóstico del estado de Google Indexing API para nuestra SA.
 * Llama al endpoint urlNotifications/getMetadata que requiere los mismos
 * permisos que publish, pero a veces devuelve errores más informativos
 * cuando hay problema de ownership.
 *
 *   GET /api/admin/indexing/diagnose?url=<url>  X-Admin-Secret
 *
 * Devuelve:
 *   - email/client_id de la SA usada (verificar que es la correcta)
 *   - token issued (si firma OK)
 *   - respuesta cruda de Google al getMetadata (status + body)
 *   - respuesta cruda de Google al publish (status + body)
 */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const email = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  const privateKey = rawKey?.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  if (!email || !privateKey) {
    return NextResponse.json({ error: "envs missing" }, { status: 503 });
  }

  const url = new URL(req.url).searchParams.get("url") || `${SITE_URL}/blog/kit-bienvenida-empleados-checklist`;

  // 1. Firmar JWT — incluimos también scope webmasters.readonly para listar
  // las propiedades GSC donde la SA tiene acceso (debugging del 403).
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const scope =
    "https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly";
  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  // 2. Intercambiar por access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenBody = await tokenRes.text();
  if (!tokenRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        step: "token-exchange-failed",
        clientEmail: email,
        tokenStatus: tokenRes.status,
        tokenBody,
      },
      { status: 200 },
    );
  }
  const { access_token } = JSON.parse(tokenBody) as { access_token: string };

  // 3. Llamar getMetadata (GET con url query param)
  const metaUrl = `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const metaBody = await metaRes.text();

  // 4. Llamar publish también para comparar
  const pubRes = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
  });
  const pubBody = await pubRes.text();

  // 5. Listar propiedades GSC donde la SA tiene acceso. Esto es la clave
  // para diagnosticar el 403 — si la lista está vacía, la SA no es Owner
  // de ninguna propiedad (a pesar de lo que veas en GSC UI).
  const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const sitesBody = await sitesRes.text();

  return NextResponse.json({
    ok: pubRes.ok,
    diagnosis: {
      serviceAccountEmail: email,
      // Decoded JWT payload (header.payload.signature)
      jwtPayload: JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()),
      tokenObtained: true,
      url,
      getMetadata: { status: metaRes.status, body: tryParse(metaBody) },
      publish: { status: pubRes.status, body: tryParse(pubBody) },
      sitesAccess: { status: sitesRes.status, body: tryParse(sitesBody) },
    },
  });
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
