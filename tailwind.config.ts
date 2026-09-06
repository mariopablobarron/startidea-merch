import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * Paleta y tipografía del Manual de identidad Startidea v1.0.
 *
 * ── Qué cambió y por qué ────────────────────────────────────────────────────
 * Hasta ahora el fondo era crema `#F4EFE6` con apoyo hueso `#EAE3D3`. El manual
 * vigente los prohíbe expresamente: el papel es BLANCO y el color entra por el
 * degradado y por el rosa pálido de las bandas. Los presupuestos ya iban por la
 * paleta nueva, así que la web y el panel enseñaban una marca y el documento que
 * se manda al cliente, otra.
 *
 * Los NOMBRES de los tokens no cambian —`bone`, `ink`, `line`, `accent`— porque
 * los usan casi 1.900 sitios: se cambia el valor, no las 224 plantillas. El
 * nombre `bone` («hueso») se queda como cicatriz del color que hubo; renombrarlo
 * a `paper` sería un diff de mil líneas sin más efecto que el estético.
 *
 * ── La paleta ───────────────────────────────────────────────────────────────
 *   fondo       #FFFFFF   ·  bandas y bloques   #FDEEF3
 *   tinta       #231F27   ·  gris secundario    #5E5A63
 *   línea       #E7E2E6   ·  degradado  #8F1039 → #C41D51
 *
 * Nada de negro puro (ni como fondo ni como texto) ni de tonos hueso o crema.
 * Los valores intermedios (`accent.dark`, `ink.soft`, `accent.mist`) son
 * derivados de los seis oficiales para estados de hover y superficies, no
 * colores nuevos.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tinta — cuerpo de texto, navs, footers. Nunca negro puro.
        ink: {
          DEFAULT: "#231F27", // Tinta oficial
          soft: "#3A353E",    // derivado: texto sobre fondos claros con menos peso
          mute: "#5E5A63",    // Gris secundario oficial
        },
        // Papel — el fondo es BLANCO. `soft` es la superficie neutra (cards,
        // bandas sin énfasis): un casi-blanco FRÍO derivado de la línea, no un
        // tono cálido. Ojo con la tentación de ponerle aquí el rosa pálido:
        // `bg-bone-soft` sale 876 veces y el rosa es para bloques DESTACADOS
        // (`accent.wash`, 157 usos) — con las dos cosas juntas el sitio entero
        // se vuelve rosa y el énfasis deja de significar nada.
        bone: {
          DEFAULT: "#FFFFFF",
          soft: "#F7F5F7",    // derivado de #E7E2E6: superficie neutra sobre blanco
        },
        // Línea — filetes, bordes y separadores.
        line: {
          DEFAULT: "#E7E2E6", // Línea oficial
          dark: "#231F27",    // superficies oscuras: tinta, nunca negro
        },
        // Acento (magenta) — CTAs, titulares cortos, datos. NUNCA fondo masivo.
        // DEFAULT y `deep` son los dos extremos del degradado de marca.
        accent: {
          DEFAULT: "#C41D51", // Magenta oficial (extremo claro del degradado)
          dark: "#A81845",    // derivado: hover
          deep: "#8F1039",    // Vino oficial (extremo oscuro del degradado)
          light: "#E58BA9",   // derivado: acentos sobre fondo oscuro
          mist: "#F8DCE6",    // derivado: superficie rosa con algo más de cuerpo
          wash: "#FDEEF3",    // Rosa pálido oficial
        },
        // Color "social" mantenido para alertas verdes (ok states) — Granada Social
        // tiene su azul propio (no se usa aquí por convención del manual).
        social: {
          DEFAULT: "#4a9d7f",
          dark: "#38826a",
        },
      },
      fontFamily: {
        // Montserrat en titulares, Inter en texto (manual v1.0). Antes Montserrat
        // hacía las dos cosas: en párrafos largos cansa y no es lo que dice el
        // manual ni lo que llevan los presupuestos.
        display: ["var(--font-display)", "var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
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
