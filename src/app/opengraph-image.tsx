import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "todomerchandising — merchandising con impacto social";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#F5F1EA",
          padding: "80px",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-200px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "1200px",
            height: "600px",
            borderRadius: "9999px",
            background: "rgba(255,90,31,0.18)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "22px",
            fontWeight: 600,
            color: "#0B0B0F",
            letterSpacing: "-0.01em",
            zIndex: 1,
          }}
        >
          <span>todo</span>
          <span style={{ color: "#FF5A1F" }}>merchandising</span>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "32px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 18px",
              borderRadius: "9999px",
              border: "1px solid rgba(11,11,15,0.12)",
              background: "rgba(11,11,15,0.03)",
              width: "fit-content",
              fontSize: "16px",
              fontWeight: 500,
              color: "rgba(11,11,15,0.7)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "9999px",
                background: "#10B981",
              }}
            />
            Impacto social real
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "92px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: "#0B0B0F",
            }}
          >
            <span>Tu marca,</span>
            <span>en manos que</span>
            <span style={{ color: "#FF5A1F" }}>cambian vidas.</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "20px",
              fontSize: "20px",
              color: "rgba(11,11,15,0.55)",
            }}
          >
            <span>Una iniciativa de Startidea</span>
            <span>merchandising.startidea.es</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
