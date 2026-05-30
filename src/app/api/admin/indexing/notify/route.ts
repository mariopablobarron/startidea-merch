import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  notifyGoogleIndexing,
  isGoogleIndexingConfigured,
} from "@/lib/google-indexing";
import { submitToIndexNow, isIndexNowConfigured } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Notifica a Google Indexing API que se re-crawleen URLs concretas.
 *
 *   POST /api/admin/indexing/notify   X-Admin-Secret
 *
 * Body opciones:
 *   {} (sin body)          → notifica todos los blog posts PUBLISHED
 *   { mode: "blog" }       → idem (explícito)
 *   { urls: [...] }        → notifica esa lista (max 100 por cuota Google)
 *
 * Respuesta: lista por URL con ok/error de Google.
 */
export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const googleReady = isGoogleIndexingConfigured();
  const indexNowReady = isIndexNowConfigured();

  if (!googleReady && !indexNowReady) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Ningún proveedor de indexación configurado. Añade GOOGLE_INDEXING_* o INDEXNOW_KEY al .env.",
      },
      { status: 503 },
    );
  }

  let body: { urls?: string[]; mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body vacío → modo blog
  }

  let urls: string[] = [];

  if (Array.isArray(body.urls) && body.urls.length > 0) {
    urls = body.urls.slice(0, 100); // límite defensivo
  } else {
    // Modo por defecto: todos los blog posts PUBLISHED
    const posts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true },
      orderBy: { publishedAt: "desc" },
    });
    urls = posts.map((p) => `${SITE_URL}/blog/${p.slug}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ ok: true, message: "No hay URLs que notificar" });
  }

  // Disparamos en paralelo. Google e IndexNow son independientes — si
  // uno falla, el otro puede tener éxito.
  const [googleResults, indexNowResult] = await Promise.all([
    googleReady
      ? notifyGoogleIndexing(urls, "URL_UPDATED")
      : Promise.resolve(null),
    indexNowReady ? submitToIndexNow(urls) : Promise.resolve(null),
  ]);

  const googleOk = googleResults?.filter((r) => r.ok).length ?? 0;
  const googleFail = (googleResults?.length ?? 0) - googleOk;

  return NextResponse.json({
    ok: true,
    google: googleResults
      ? {
          notified: googleOk,
          failed: googleFail,
          total: googleResults.length,
          results: googleResults,
        }
      : { skipped: "not configured" },
    indexNow: indexNowResult
      ? {
          ok: indexNowResult.ok,
          status: indexNowResult.status,
          urlsSubmitted: indexNowResult.urlsSubmitted,
          message: indexNowResult.message,
        }
      : { skipped: "not configured" },
  });
}
