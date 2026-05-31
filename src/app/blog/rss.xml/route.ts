import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * RSS 2.0 feed del blog. Útil para:
 *  - Suscriptores que usan lectores (Feedly, Inoreader)
 *  - Crawlers de buscadores que descubren posts vía RSS
 *  - Pingomatic / IFTTT / Zapier / agregadores que disparan automatizaciones
 *  - AI search (Perplexity, Phind) que descubren contenido nuevo más rápido
 *
 *   GET /blog/rss.xml → application/rss+xml
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await prisma.blogPost
    .findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        updatedAt: true,
        author: true,
        tags: true,
        heroUrl: true,
      },
    })
    .catch(() => []);

  const latestUpdate = posts[0]?.updatedAt || new Date();

  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      const pub = (p.publishedAt || p.updatedAt).toUTCString();
      const desc = p.excerpt || "";
      const image = p.heroUrl || `${SITE_URL}/blog/${p.slug}/opengraph-image`;
      const categories = p.tags.map((t) => `<category>${esc(t)}</category>`).join("\n      ");
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${esc(desc)}</description>
      <pubDate>${pub}</pubDate>
      ${p.author ? `<author>noreply@startidea.es (${esc(p.author)})</author>` : ""}
      ${categories}
      <enclosure url="${esc(image)}" type="image/png" length="0"/>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>TodoMerchandising · Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Guías prácticas, casos reales y datos del mercado del merchandising corporativo B2B en España. Una iniciativa de Startidea.</description>
    <language>es-ES</language>
    <copyright>© Startidea Málaga SL</copyright>
    <lastBuildDate>${latestUpdate.toUTCString()}</lastBuildDate>
    <generator>Next.js 15 + Prisma</generator>
    <image>
      <url>${SITE_URL}/opengraph-image</url>
      <title>TodoMerchandising</title>
      <link>${SITE_URL}/blog</link>
    </image>
${items}
  </channel>
</rss>
`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
