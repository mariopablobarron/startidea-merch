import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import { CompareBanner } from "@/components/CompareBanner";
import { CartBanner } from "@/components/CartBanner";
import { PWARegister } from "@/components/PWARegister";
import { GlobalErrorTracker } from "@/components/GlobalErrorTracker";
import { ReferrerTracker } from "@/components/ReferrerTracker";
// OnboardingTour automático sustituido por Tour on-demand vía TourLauncher
// en navbar. El antiguo tour interrumpía en móvil y se eliminó por UX.
import { Tour } from "@/components/Tour";
import { Analytics } from "@/components/Analytics";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { AdsPixels } from "@/components/AdsPixels";
import { CookieBanner } from "@/components/CookieBanner";
import { SpotifyPixel } from "@/components/SpotifyPixel";
import { EntryPopupAB } from "@/components/EntryPopupAB";
import { AttributionTracker } from "@/components/AttributionTracker";
import { VoiceAgentGate } from "@/components/VoiceAgentGate";
import { FloatingSurfaceCoordinator } from "@/components/FloatingSurfaceCoordinator";
import { floatingSurfacePriorityCss } from "@/lib/floating-surfaces";

// Tipografía oficial Manual de identidad Startidea v1.0
// Montserrat para todo el sistema · Alternates solo display (h1, citas).
// Fuentes auto-alojadas (subset latin descargado de Google Fonts el 11-jun-2026).
// next/font/google descargaba en CADA build: dos builds cayeron por timeouts
// de la red del VPS hacia fonts.googleapis.com. Con next/font/local el build
// no toca la red. Montserrat es fuente variable (un archivo cubre 400-700).
const montserrat = localFont({
  src: "../fonts/montserrat-latin-var.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});
const montserratAlt = localFont({
  src: [
    { path: "../fonts/montserrat-alt-latin-500.woff2", weight: "500" },
    { path: "../fonts/montserrat-alt-latin-600.woff2", weight: "600" },
    { path: "../fonts/montserrat-alt-latin-700.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TodoMerchandising — Merchandising con impacto social",
    template: "%s · TodoMerchandising",
  },
  description:
    "Merchandising corporativo personalizado con impacto social real. Cada pedido genera trabajo digno en Centros Especiales de Empleo y empresas locales.",
  // NO definir alternates.canonical global aquí — Next.js lo heredaba
  // literalmente a TODAS las páginas que no lo sobrescriben (resultado:
  // /sobre, /promociones, /ayuda... etc. apuntaban canonical → home,
  // disparando aviso GSC "Página alternativa con etiqueta canónica
  // adecuada". Cada page debe declarar su propio canonical.
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "TodoMerchandising",
    // NO definir openGraph.url aquí — mismo error que el canonical global de
    // arriba, en el campo de al lado: Next lo heredaba literalmente y 10 de
    // cada 12 páginas anunciaban a las redes que su URL era la home (medido en
    // producción el 25-ago-2026). Cada page declara la suya, o la deriva de su
    // canonical al pasar por `mergeMetadata`.
    title: "TodoMerchandising — Merchandising con impacto social",
    description:
      "Merchandising corporativo con impacto social. CEE y empresas locales detrás de cada pedido.",
    // Imagen Open Graph: Next 15 sirve `src/app/opengraph-image.tsx`
    // automáticamente — no declarar `images` aquí evita 404 del PNG
    // estático que no existe. Cada page (producto/blog) puede sobrescribir
    // colocando su propio `opengraph-image.tsx` o declarando `images` en su metadata.
  },
  twitter: {
    card: "summary_large_image",
    title: "TodoMerchandising — Merchandising con impacto social",
    description:
      "Merchandising corporativo con impacto social. CEE y empresas locales detrás de cada pedido.",
    // images: Next 15 sirve `src/app/twitter-image.tsx` o reutiliza opengraph-image
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "TodoMerch",
    statusBarStyle: "black-translucent",
  },
};

// Next.js 15 movió themeColor, viewport y colorScheme a un export aparte.
// Antes vivía en `metadata.themeColor` (deprecated en 14, warning en 15).
export const viewport: Viewport = {
  themeColor: "#F4EFE6", // crema — fondo por defecto manual Startidea
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${montserratAlt.variable}`}>
      <head>
        <style>{floatingSurfacePriorityCss()}</style>
        {/* Umami: solo `dns-prefetch`, NO `preconnect`.
            El `preconnect` que había aquí abría el handshake TCP/TLS con el
            servidor de analítica en el primer paint — es decir, le enseñaba
            la IP del visitante antes de que aceptara nada, justo lo que
            acaba de arreglarse gateando el script. `dns-prefetch` solo
            resuelve el nombre, que es el criterio que este mismo fichero
            aplica dos líneas más abajo a los pixels de ads.
            Coste: el primer evento de Umami paga el handshake. Lo paga
            quien ha dicho que sí, y solo una vez. */}
        <link rel="dns-prefetch" href="https://analytics.hubstartidea.es" />
        {/* Fonts ya gestionados por next/font (auto-preconnect) */}
        {/* Ads pixels — dns-prefetch para que solo resuelvan DNS sin
            handshake hasta que el usuario acepte cookies */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://px.ads.linkedin.com" />
        <link rel="dns-prefetch" href="https://pixel.byspotify.com" />
        {/* Umami analytics — SOLO con consentimiento de analíticas.
            Antes se inyectaba aquí mismo, sin puerta: medía a todo el mundo
            desde la primera carga mientras el banner ofrecía «Analíticas»
            como una casilla que se podía desmarcar. */}
        <UmamiAnalytics />
        {/* GA4 + Search Console — opcional, se activa con env vars */}
        <GoogleAnalytics />
        {/* Pixels publicitarios Meta + Google Ads + LinkedIn (env-driven) */}
        <AdsPixels />
        {/* Feeds discoverables — RSS del blog + llms.txt para AI crawlers */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="TodoMerchandising · Blog"
          href="/blog/rss.xml"
        />
      </head>
      <body>
        {children}
        <CartBanner />
        <CompareBanner />
        <Tour />
        <PWARegister />
        <GlobalErrorTracker />
        <ReferrerTracker />
        <AttributionTracker />
        <Analytics />
        <SpotifyPixel />
        <CookieBanner />
        <EntryPopupAB />
        <VoiceAgentGate />
        <FloatingSurfaceCoordinator />
      </body>
    </html>
  );
}
