import { ImageResponse } from "next/og";

/**
 * Icono para «Añadir a pantalla de inicio» en iOS.
 *
 * Medido el 26-ago-2026: `/apple-touch-icon.png` devolvía 404 y el HTML no
 * declaraba ningún `apple-touch-icon`. iOS, sin él, guarda una captura reducida
 * de la página como icono — el sitio quedaba en la pantalla de inicio como un
 * recorte borroso en vez de como la marca. El `icon.svg` no cubre este caso:
 * iOS no acepta SVG para el icono de pantalla de inicio.
 *
 * Se dibuja aquí, y no como PNG en `public/`, para que el icono siga al mismo
 * SVG de marca (`src/app/icon.svg`) sin mantener dos ficheros binarios en
 * paralelo que se desincronizan.
 *
 * Nota: NO usar `runtime = "edge"` — el VPS sirve Next con Node estándar en
 * Docker y el edge handler devuelve 502 (ver `opengraph-image.tsx`).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Sin `border-radius`: iOS recorta el icono con su propia máscara y
          // un redondeo propio dejaría esquinas oscuras dentro de la suya.
          background: "#0B0B0F",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M14 34 L26 22 L38 34 L26 46 Z" fill="#FF5A1F" />
          <circle cx="44" cy="22" r="6" fill="#F5F1EA" />
        </svg>
      </div>
    ),
    size,
  );
}
