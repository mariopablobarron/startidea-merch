import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { BannerSlot } from "@/components/BannerSlot";
import { ClientLogos } from "@/components/ClientLogos";
import { PortfolioGrid } from "@/components/PortfolioGrid";
import { Marquee } from "@/components/Marquee";
import { Impact } from "@/components/Impact";
import { ImpactLive } from "@/components/ImpactLive";
import { Process } from "@/components/Process";
import { Categories } from "@/components/Categories";
import { Partners } from "@/components/Partners";
import { Cases } from "@/components/Cases";
import { PublicReviews } from "@/components/PublicReviews";
import { SeoContent } from "@/components/SeoContent";
import { Faq } from "@/components/Faq";
import { QuoteSection } from "@/components/QuoteSection";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { StickyMobileCta } from "@/components/StickyMobileCta";
import { JsonLd } from "@/components/JsonLd";
import { ORGANIZATION_JSONLD, WEBSITE_JSONLD, FAQ_JSONLD } from "@/lib/jsonld";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";
import { getPageSeo, mergeMetadata } from "@/lib/page-seo";
import type { Metadata } from "next";

// Dynamic: la home lee DB para hero (precio mínimo + count). Build time no
// tiene DATABASE_URL (se inyecta solo en runtime), así que no intentar
// pre-renderizar. La query es muy barata (aggregate sin filtros + count).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("/");
  return mergeMetadata({}, seo);
}

async function getHeroData() {
  try {
    const [minPrice, productCount] = await Promise.all([
      prisma.product.aggregate({
        where: { active: true, fromPriceCents: { gt: 0 } },
        _min: { fromPriceCents: true },
      }),
      prisma.product.count({ where: { active: true } }),
    ]);
    return {
      priceFromCents: minPrice._min.fromPriceCents ?? undefined,
      productCount,
    };
  } catch {
    // Fallback si DB no disponible (build time o downtime)
    return { priceFromCents: undefined, productCount: 2400 };
  }
}

export default async function HomePage() {
  const [hero, settings] = await Promise.all([getHeroData(), getSiteSettings()]);

  return (
    <>
      <JsonLd data={[ORGANIZATION_JSONLD, WEBSITE_JSONLD, FAQ_JSONLD]} />
      <Nav />
      <main>
        <Hero
          priceFromCents={hero.priceFromCents}
          productCount={hero.productCount}
          badge={settings["hero.badge"]}
          h1Prefix={settings["hero.h1Prefix"]}
          h1Accent={settings["hero.h1Accent"]}
          subhead={settings["hero.subhead"]}
          ctaPrimary={settings["hero.ctaPrimary"]}
          ctaSecondary={settings["hero.ctaSecondary"]}
        />
        <BannerSlot slot="HOME_TOP" />
        <ClientLogos />
        <Marquee />
        <Impact />
        <ImpactLive />
        <Process />
        <BannerSlot slot="HOME_MID" />
        <PortfolioGrid variant="home" />
        <Cases />
        <PublicReviews />
        <Partners />
        <Categories />
        <SeoContent />
        <Faq />
        <QuoteSection />
      </main>
      <Footer />
      <WhatsAppFloat />
      <StickyMobileCta />
    </>
  );
}
