import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import { CompareBanner } from "@/components/CompareBanner";
import { CartBanner } from "@/components/CartBanner";
import { PWARegister } from "@/components/PWARegister";
import { GlobalErrorTracker } from "@/components/GlobalErrorTracker";
// OnboardingTour automático sustituido por Tour on-demand vía TourLauncher
// en navbar. El antiguo tour interrumpía en móvil y se eliminó por UX.
import { Tour } from "@/components/Tour";
import { Analytics } from "@/components/Analytics";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { AdsPixels } from "@/components/AdsPixels";
import { CookieBanner } from "@/components/CookieBanner";
import { EmailCapturePopup } from "@/components/EmailCapturePopup";
import { VoiceAgentGate } from "@/components/VoiceAgentGate";

// Tipografía oficial Manual de identidad Startidea v1.0
// Montserrat para todo el sistema · Alternates solo display (h1, citas).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const montserratAlt = Montserrat_Alternates({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

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
    url: SITE_URL,
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
  themeColor: "#F4EFE6", // crema — fondo por defecto manual Startidea
  appleWebApp: {
    capable: true,
    title: "TodoMerch",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${montserratAlt.variable}`}>
      <head>
        {/* Performance: preconnect a orígenes críticos que cargamos en el
            primer paint. Reduce LCP eliminando handshake TCP/TLS. Solo
            los críticos — los de ads van con dns-prefetch (más barato). */}
        <link rel="preconnect" href="https://analytics.hubstartidea.es" />
        <link rel="dns-prefetch" href="https://analytics.hubstartidea.es" />
        {/* Fonts ya gestionados por next/font (auto-preconnect) */}
        {/* Ads pixels — dns-prefetch para que solo resuelvan DNS sin
            handshake hasta que el usuario acepte cookies */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://px.ads.linkedin.com" />
        {/* Umami analytics (privacy-first, sin cookies) */}
        <Script
          defer
          src="https://analytics.hubstartidea.es/script.js"
          data-website-id="7ab5c23b-9087-43ae-99fb-40e6c46d6da0"
          strategy="afterInteractive"
        />
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
        <Analytics />
        <CookieBanner />
        <EmailCapturePopup />
        <VoiceAgentGate />
      </body>
    </html>
  );
}
