import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import { CompareBanner } from "@/components/CompareBanner";
import { CartBanner } from "@/components/CartBanner";
import { PWARegister } from "@/components/PWARegister";
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
  alternates: {
    // Canonical raíz · cada página puede sobrescribir con su slug propio
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "TodoMerchandising",
    url: SITE_URL,
    title: "TodoMerchandising — Merchandising con impacto social",
    description:
      "Merchandising corporativo con impacto social. CEE y empresas locales detrás de cada pedido.",
    // Imagen Open Graph por defecto · cada page (producto/blog) la sobrescribe
    // con su imagen propia para shares más visuales.
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "TodoMerchandising — merchandising corporativo personalizado",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TodoMerchandising — Merchandising con impacto social",
    description:
      "Merchandising corporativo con impacto social. CEE y empresas locales detrás de cada pedido.",
    images: ["/og-default.png"],
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
        {/* Umami analytics (privacy-first, sin cookies) */}
        <Script
          defer
          src="https://analytics.hubstartidea.es/script.js"
          data-website-id="530b17d7-0550-4d76-8264-13078706b507"
          strategy="afterInteractive"
        />
        {/* GA4 + Search Console — opcional, se activa con env vars */}
        <GoogleAnalytics />
        {/* Pixels publicitarios Meta + Google Ads + LinkedIn (env-driven) */}
        <AdsPixels />
      </head>
      <body>
        {children}
        <CartBanner />
        <CompareBanner />
        <Tour />
        <PWARegister />
        <Analytics />
        <CookieBanner />
        <EmailCapturePopup />
        <VoiceAgentGate />
      </body>
    </html>
  );
}
