import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Marquee } from "@/components/Marquee";
import { Impact } from "@/components/Impact";
import { ImpactLive } from "@/components/ImpactLive";
import { Process } from "@/components/Process";
import { Categories } from "@/components/Categories";
import { Partners } from "@/components/Partners";
import { Cases } from "@/components/Cases";
import { PublicReviews } from "@/components/PublicReviews";
import { Faq } from "@/components/Faq";
import { QuoteSection } from "@/components/QuoteSection";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { StickyMobileCta } from "@/components/StickyMobileCta";
import { JsonLd } from "@/components/JsonLd";
import { ORGANIZATION_JSONLD, WEBSITE_JSONLD, FAQ_JSONLD } from "@/lib/jsonld";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600; // home cachea 1h — el "desde X €/ud" cambia poco

export default async function HomePage() {
  // Hero usa datos reales: precio mínimo de catálogo y nº productos activos
  const [minPrice, productCount] = await Promise.all([
    prisma.product.aggregate({
      where: { active: true, fromPriceCents: { gt: 0 } },
      _min: { fromPriceCents: true },
    }),
    prisma.product.count({ where: { active: true } }),
  ]);

  return (
    <>
      <JsonLd data={[ORGANIZATION_JSONLD, WEBSITE_JSONLD, FAQ_JSONLD]} />
      <Nav />
      <main>
        <Hero
          priceFromCents={minPrice._min.fromPriceCents ?? undefined}
          productCount={productCount}
        />
        <Marquee />
        <Impact />
        <ImpactLive />
        <Process />
        <Cases />
        <PublicReviews />
        <Partners />
        <Categories />
        <Faq />
        <QuoteSection />
      </main>
      <Footer />
      <WhatsAppFloat />
      <StickyMobileCta />
    </>
  );
}
