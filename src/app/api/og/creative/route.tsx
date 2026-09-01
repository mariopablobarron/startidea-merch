/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Renderiza una creatividad PNG según plantilla.
 * URL: /api/og/creative?template=...&title=...&subtitle=...&product=...&cta=...&accent=...
 *
 * Templates:
 *   post-square        1080×1080  (IG feed, FB, LinkedIn cuadrado)
 *   story-vertical     1080×1920  (IG/FB Story, TikTok)
 *   linkedin-landscape 1200×628   (LinkedIn header post)
 *   email-header       1200×400   (cabecera de email)
 *
 * Todas siguen el Manual de identidad Startidea v1.0:
 *   Magenta #C41D51 acento · Blanco #FFFFFF papel · Tinta #231F27 texto
 *
 * Cache: 1h CDN (Cloudflare/Vercel respeta) — cambia URL si quieres regenerar.
 */

const COLORS = {
  magenta: "#C41D51",
  magentaDeep: "#8F1039",
  papel: "#FFFFFF",
  linea: "#E7E2E6",
  tinta: "#231F27",
  tintaSoft: "#3A353E",
};

type Template = "post-square" | "story-vertical" | "linkedin-landscape" | "email-header";

const DIMENSIONS: Record<Template, { w: number; h: number }> = {
  "post-square": { w: 1080, h: 1080 },
  "story-vertical": { w: 1080, h: 1920 },
  "linkedin-landscape": { w: 1200, h: 628 },
  "email-header": { w: 1200, h: 400 },
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const template = (url.searchParams.get("template") || "post-square") as Template;
  const title = url.searchParams.get("title") || "Damos forma a ideas que ya estaban ahí";
  const subtitle = url.searchParams.get("subtitle") || "";
  const cta = url.searchParams.get("cta") || "";
  const productUrl = url.searchParams.get("product") || "";
  // OJO: "crema-bg" es un valor que viaja en la URL y que hay GUARDADO en
  // ContentPiece. El color que pinta ya es el blanco del manual nuevo; renombrar
  // la variante rompería las piezas de contenido ya creadas, así que el nombre
  // se queda como está.
  const variant = (url.searchParams.get("variant") || "magenta-bg") as "magenta-bg" | "crema-bg";

  const dim = DIMENSIONS[template] || DIMENSIONS["post-square"];

  // Decisión de colores según variante
  const bg = variant === "magenta-bg" ? COLORS.magenta : COLORS.papel;
  const fg = variant === "magenta-bg" ? COLORS.papel : COLORS.tinta;
  const accent = variant === "magenta-bg" ? COLORS.papel : COLORS.magenta;
  const subdued = variant === "magenta-bg" ? "rgba(255,255,255,0.7)" : "rgba(35,31,39,0.6)";

  // Layout responsivo según template
  const isVertical = template === "story-vertical";
  const isLandscape = template === "linkedin-landscape" || template === "email-header";
  const isSquare = template === "post-square";

  const titleFontSize = isVertical ? 84 : isSquare ? 76 : 58;
  const subtitleFontSize = isVertical ? 38 : isSquare ? 34 : 26;
  const ctaFontSize = isVertical ? 32 : isSquare ? 28 : 22;
  const wordmarkSize = isVertical ? 36 : 28;

  return new ImageResponse(
    (
      <div
        style={{
          width: dim.w,
          height: dim.h,
          background: bg,
          color: fg,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: isVertical ? "80px 70px" : isSquare ? "70px" : "50px 60px",
          fontFamily: "Montserrat, sans-serif",
          position: "relative",
        }}
      >
        {/* Decoración: arco/círculo magenta tras título (solo si fondo blanco) */}
        {variant === "crema-bg" && (
          <div
            style={{
              position: "absolute",
              top: -dim.h * 0.25,
              right: -dim.h * 0.15,
              width: dim.h * 0.7,
              height: dim.h * 0.7,
              borderRadius: "50%",
              background: COLORS.magenta,
              opacity: 0.08,
            }}
          />
        )}

        {/* Top: wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: wordmarkSize,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: fg,
          }}
        >
          {/* Símbolo Startidea — dos bucles entrelazados (Manual v1.0) */}
          <svg
            width={wordmarkSize + 12}
            height={(wordmarkSize + 12) * 0.85}
            viewBox="0 0 120 100"
            style={{ flexShrink: 0 }}
          >
            <g fill="none" stroke={accent} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round">
              <path d="M 30 80 C 5 70, 10 25, 35 15 C 60 5, 55 50, 35 55 C 22 58, 22 38, 38 38" />
              <path d="M 38 38 C 50 40, 60 75, 78 78 M 70 80 C 95 70, 110 25, 80 15 C 55 8, 65 55, 82 58 C 95 60, 92 40, 80 38" />
            </g>
          </svg>
          <span>
            todo<span style={{ color: accent }}>merchandising</span>
          </span>
        </div>

        {/* Middle: título + subtítulo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 30, maxWidth: dim.w * 0.85 }}>
          <h1
            style={{
              fontSize: titleFontSize,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              margin: 0,
              color: fg,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: subtitleFontSize,
                lineHeight: 1.35,
                margin: 0,
                color: subdued,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Bottom: CTA + producto opcional */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 30,
          }}
        >
          {cta && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: variant === "magenta-bg" ? "rgba(255,255,255,0.95)" : COLORS.magenta,
                color: variant === "magenta-bg" ? COLORS.magenta : "#FFF",
                padding: isVertical ? "22px 38px" : "18px 32px",
                borderRadius: 999,
                fontSize: ctaFontSize,
                fontWeight: 600,
              }}
            >
              {cta}
              <span style={{ fontSize: ctaFontSize + 4 }}>→</span>
            </div>
          )}
          {productUrl && (
            <img
              src={productUrl}
              alt=""
              style={{
                width: isVertical ? 380 : isSquare ? 280 : 200,
                height: isVertical ? 380 : isSquare ? 280 : 200,
                objectFit: "contain",
                marginLeft: "auto",
              }}
            />
          )}
        </div>
      </div>
    ),
    {
      width: dim.w,
      height: dim.h,
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600, immutable",
      },
    },
  );
}
