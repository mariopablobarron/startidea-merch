import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * Paleta y tipografía alineadas con el Manual de identidad Startidea v1.0
 * (mayo 2026). Magenta es acento (10%) — nunca fondo salvo portadas.
 * Crema es papel (60%). Grafito es tinta (30%).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tinta (grafito) — cuerpo de texto, navs, footers
        ink: {
          DEFAULT: "#2A2A2A", // Grafito oficial
          soft: "#3A3A3A",
          mute: "#6E6E6E",
        },
        // Papel (crema) — fondo por defecto. 60% de la composición.
        bone: {
          DEFAULT: "#F4EFE6", // Crema oficial
          soft: "#FAF7F1",    // crema más clara para cards sobre crema
        },
        // Apoyo (hueso) — bandas y cards, suaviza el fondo
        line: {
          DEFAULT: "#EAE3D3", // Hueso oficial
          dark: "#1A1A1A",
        },
        // Acento (magenta) — CTAs, titulares cortos, datos. NUNCA fondo masivo.
        accent: {
          DEFAULT: "#E63E73", // Magenta Startidea
          dark: "#C42B5D",
          deep: "#A02049",
          light: "#F08AA8",
          mist: "#FBDFE9",
          wash: "#FDF1F5",
        },
        // Color "social" mantenido para alertas verdes (ok states) — Granada Social
        // tiene su azul propio (no se usa aquí por convención del manual).
        social: {
          DEFAULT: "#4a9d7f",
          dark: "#38826a",
        },
      },
      fontFamily: {
        // Montserrat para todo el sistema. Alternates solo display (h1, citas).
        display: ["var(--font-display)", "Montserrat", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Montserrat", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Jerarquía manual: pocos tamaños, mucho contraste de escala.
        // Display 72 (hero), 40 (h2), 18 cuerpo, 14 micro, 11 metadata.
        "hero": ["clamp(2.5rem, 6vw, 4.5rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "section": ["clamp(1.75rem, 3.5vw, 2.5rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
      },
      maxWidth: {
        "8xl": "88rem",
      },
    },
  },
  plugins: [typography],
};

export default config;
