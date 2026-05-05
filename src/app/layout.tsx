import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { CompareBanner } from "@/components/CompareBanner";
import { CartBanner } from "@/components/CartBanner";
import { PWARegister } from "@/components/PWARegister";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Analytics } from "@/components/Analytics";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TodoMerchandising — Merchandising con impacto social",
    template: "%s · TodoMerchandising",
  },
  description:
    "Merchandising corporativo personalizado con impacto social real. Cada pedido genera trabajo digno en Centros Especiales de Empleo y empresas locales.",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "TodoMerchandising",
    url: SITE_URL,
    title: "TodoMerchandising — Merchandising con impacto social",
    description:
      "Merchandising corporativo con impacto social. CEE y empresas locales detrás de cada pedido.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  themeColor: "#0a0a0b",
  appleWebApp: {
    capable: true,
    title: "TodoMerch",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&f[]=inter@400,500,600&display=swap"
        />
        {/* Umami analytics (privacy-first, sin cookies) */}
        <Script
          defer
          src="https://analytics.hubstartidea.es/script.js"
          data-website-id="530b17d7-0550-4d76-8264-13078706b507"
          strategy="afterInteractive"
        />
      </head>
      <body>
        {children}
        <CartBanner />
        <CompareBanner />
        <OnboardingTour />
        <PWARegister />
        <Analytics />
      </body>
    </html>
  );
}
