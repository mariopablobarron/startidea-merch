import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0F",
          soft: "#1A1A22",
        },
        bone: {
          DEFAULT: "#F5F1EA",
          soft: "#FAF7F2",
        },
        accent: {
          DEFAULT: "#FF5A1F",
          dark: "#D6440F",
        },
        social: {
          DEFAULT: "#10B981",
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
