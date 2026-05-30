import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  notifyGoogleIndexing,
  isGoogleIndexingConfigured,
} from "@/lib/google-indexing";

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

  if (!isGoogleIndexingConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Indexing API no configurada. Faltan GOOGLE_INDEXING_CLIENT_EMAIL y GOOGLE_INDEXING_PRIVATE_KEY en el .env.",
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
    return NextResponse.json({ ok: true, message: "No hay URLs que notificar", results: [] });
  }

  const results = await notifyGoogleIndexing(urls, "URL_UPDATED");
  const okCount = results.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: true,
    notified: okCount,
    failed: results.length - okCount,
    total: results.length,
    results,
  });
}
