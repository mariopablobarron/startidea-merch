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

export default function HomePage() {
  return (
    <>
      <JsonLd data={[ORGANIZATION_JSONLD, WEBSITE_JSONLD, FAQ_JSONLD]} />
      <Nav />
      <main>
        <Hero />
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
