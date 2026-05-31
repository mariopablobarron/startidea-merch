import { ImageResponse } from "next/og";
import { getSector } from "@/lib/sectors";

// Runtime nodejs — VPS self-hosted no soporta edge.
export const alt = "TodoMerchandising — landing por sector";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Genera dinámicamente el OG image de cada landing de sector — PNG 1200×630
 * con el título del sector + icono + slogan corto sobre paleta Startidea.
 *
 * Se sirve automáticamente como og:image y twitter:image para cada URL
 * /sectores/{slug}. Sin imágenes manuales.
 */
export default async function SectorOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sector = getSector(slug);

  const title = sector?.title ?? "Sector";
  const icon = sector?.icon ?? "🎯";
  const tagline = sector?.short ?? "Merchandising corporativo";

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
            Sectores
          </div>
        </div>

        {/* Title block */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            zIndex: 1,
          }}
        >
          {/* Icon grande */}
          <div style={{ fontSize: "100px", lineHeight: 1, display: "flex" }}>
            {icon}
          </div>

          {/* Título "Merchandising para X" */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "76px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#0B0B0F",
            }}
          >
            <span>Merchandising para</span>
            <span style={{ color: "#FF5A1F" }}>{title.toLowerCase()}</span>
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              color: "rgba(11,11,15,0.55)",
              maxWidth: "900px",
            }}
          >
            {tagline}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
