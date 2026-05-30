import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

// Nota: NO usar `runtime = "edge"`. VPS auto-hospedado sirve Node estándar
// (Docker). ImageResponse funciona perfecto en runtime nodejs (default).
export const alt = "TodoMerchandising — artículo del blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Genera dinámicamente el OG image de cada blog post — PNG 1200×630 con
 * el título, autor y fecha sobre la paleta Startidea. Sin imágenes
 * manuales en BD.
 *
 * Se usa también como `heroUrl` fallback en las cards del blog y en el
 * JSON-LD Article.image.
 */
export default async function BlogOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost
    .findUnique({
      where: { slug },
      select: { title: true, publishedAt: true, author: true, tags: true },
    })
    .catch(() => null);

  const title = post?.title ?? "Blog · TodoMerchandising";
  const tag = post?.tags?.[0] ?? "Blog";
  const date = post?.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  // Ajuste de tamaño de título según longitud
  const titleSize = title.length > 80 ? 56 : title.length > 50 ? 68 : 80;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#F5F1EA",
          padding: "70px 80px",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Glow naranja */}
        <div
          style={{
            position: "absolute",
            top: "-250px",
            right: "-150px",
            width: "800px",
            height: "800px",
            borderRadius: "9999px",
            background: "rgba(255,90,31,0.14)",
            filter: "blur(100px)",
          }}
        />

        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "22px",
              fontWeight: 600,
              color: "#0B0B0F",
              letterSpacing: "-0.01em",
            }}
          >
            <span>todo</span>
            <span style={{ color: "#FF5A1F" }}>merchandising</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 16px",
              borderRadius: "9999px",
              background: "rgba(11,11,15,0.06)",
              fontSize: "14px",
              fontWeight: 500,
              color: "rgba(11,11,15,0.65)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Blog · {tag}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: `${titleSize}px`,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#0B0B0F",
            }}
          >
            {title}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "18px",
              color: "rgba(11,11,15,0.5)",
              marginTop: "16px",
            }}
          >
            {date && <span>{date}</span>}
            {date && <span style={{ color: "rgba(11,11,15,0.25)" }}>·</span>}
            <span>merchandising.hubstartidea.es</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
