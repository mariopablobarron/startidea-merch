import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Paleta oficial Startidea — alineada con hub-startidea-web/app/globals.css
      colors: {
        ink: {
          DEFAULT: "#0a0a0b",
          soft: "#1a1a1d",
          mute: "#6b6b6b",
        },
        bone: {
          DEFAULT: "#f1ede5", // paper-2
          soft: "#faf8f4",    // paper
        },
        line: {
          DEFAULT: "#e6e1d6",
          dark: "#2a2a2e",
        },
        accent: {
          DEFAULT: "#ff6b35", // coral-500 — naranja cálido oficial
          dark: "#ed4f15",    // coral-600 (hover)
          deep: "#c43c0d",    // coral-700
          light: "#ffae84",   // coral-300
          mist: "#ffe0d0",    // coral-100
          wash: "#fff3ed",    // coral-50
        },
        social: {
          DEFAULT: "#4a9d7f", // moss-500 — verde Startidea
          dark: "#38826a",    // moss-600
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "hero": ["clamp(2.5rem, 6vw, 5.5rem)", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "section": ["clamp(2rem, 4vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      maxWidth: {
        "8xl": "88rem",
      },
    },
  },
  plugins: [],
};

export default config;
