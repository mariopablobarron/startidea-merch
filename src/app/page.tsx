import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Marquee } from "@/components/Marquee";
import { Impact } from "@/components/Impact";
import { Process } from "@/components/Process";
import { Categories } from "@/components/Categories";
import { Partners } from "@/components/Partners";
import { Cases } from "@/components/Cases";
import { Faq } from "@/components/Faq";
import { QuoteSection } from "@/components/QuoteSection";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Impact />
        <Process />
        <Cases />
        <Partners />
        <Categories />
        <Faq />
        <QuoteSection />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
