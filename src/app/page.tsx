import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { TrustStrip } from "@/components/TrustStrip";
import { BestSellers } from "@/components/BestSellers";
import { MockupLeadCta } from "@/components/MockupLeadCta";
import { ActivePromotionBar } from "@/components/ActivePromotionBar";
import { BannerSlot } from "@/components/BannerSlot";
import { ClientLogos } from "@/components/ClientLogos";
import { PortfolioGrid } from "@/components/PortfolioGrid";
import { Marquee } from "@/components/Marquee";
import { Impact } from "@/components/Impact";
import { Process } from "@/components/Process";
import { Categories } from "@/components/Categories";
import { Partners } from "@/components/Partners";
import { Cases } from "@/components/Cases";
import { LatestPosts } from "@/components/LatestPosts";
import { PublicReviews } from "@/components/PublicReviews";
import { SeoContent } from "@/components/SeoContent";
import { Faq } from "@/components/Faq";
import { ClosingStatement } from "@/components/ClosingStatement";
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
  return mergeMetadata(
    { alternates: { canonical: "https://merchandising.startidea.es/" } },
    seo,
  );
}

async function getHeroData() {
  try {
    const [minPrice, productCount] = await Promise.all([
      prisma.product.aggregate({
        // Suelo de 0,10 € — evita que un precio artefacto (1 céntimo del feed)
        // ensucie el "desde X €" del hero.
        where: { active: true, fromPriceCents: { gte: 10 } },
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
      <ActivePromotionBar />
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
        <TrustStrip />
        <BannerSlot slot="HOME_TOP" />
        <ClientLogos />
        <Marquee />
        <BestSellers />
        <Impact />
        <PublicReviews />
        <Process />
        <MockupLeadCta />
        <BannerSlot slot="HOME_MID" />
        <PortfolioGrid variant="home" />
        <Cases />
        <LatestPosts />
        <Partners />
        <Categories />
        <SeoContent />
        <Faq />
        <ClosingStatement />
        <QuoteSection />
      </main>
      <Footer />
      <WhatsAppFloat />
      <StickyMobileCta />
    </>
  );
}
