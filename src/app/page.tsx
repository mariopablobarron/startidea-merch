import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Marquee } from "@/components/Marquee";
import { Impact } from "@/components/Impact";
import { Process } from "@/components/Process";
import { Categories } from "@/components/Categories";
import { QuoteSection } from "@/components/QuoteSection";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Impact />
        <Process />
        <Categories />
        <QuoteSection />
      </main>
      <Footer />
    </>
  );
}
