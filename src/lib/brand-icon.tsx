import { ImageResponse } from "next/og";

/**
 * El icono de marca en PNG, a cualquier tamaño.
 *
 * Un solo dibujo para `apple-icon` y para los iconos del manifest: el SVG de
 * marca vive en `src/app/icon.svg` y estos lo reproducen. Mantener PNGs
 * binarios en `public/` obligaría a regenerarlos a mano cada vez que el logo
 * cambie, y en la práctica eso significa que dejan de parecerse al logo.
 *
 * Nota: NO usar `runtime = "edge"` — el VPS sirve Next con Node estándar en
 * Docker y el edge handler devuelve 502 (ver `opengraph-image.tsx`).
 */
export function brandIcon(px: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0B0F",
        }}
      >
        <svg width={px} height={px} viewBox="0 0 64 64">
          <path d="M14 34 L26 22 L38 34 L26 46 Z" fill="#FF5A1F" />
          <circle cx="44" cy="22" r="6" fill="#F5F1EA" />
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}
