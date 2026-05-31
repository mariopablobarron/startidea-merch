import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { PortfolioGrid } from "@/components/PortfolioGrid";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

const BASE_METADATA: Metadata = {
  title: "Trabajos realizados · TodoMerchandising",
  description:
    "Galería de pedidos reales: empresas, eventos y campañas que han producido merchandising personalizado con impacto en TodoMerchandising.",
  alternates: { canonical: "https://merchandising.hubstartidea.es/trabajos" },
};

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("/trabajos");
  return mergeMetadata(BASE_METADATA, seo);
}

export const dynamic = "force-dynamic";

export default function TrabajosPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Trabajos", url: "/trabajos" }]) as never} />
      <Nav />
      <main>
        <section className="border-b border-line bg-bone py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Portfolio</p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              Trabajos realizados
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/65 lg:text-lg">
              Cada imagen es un pedido real producido en Centros Especiales de Empleo o talleres
              locales. Filtros disponibles por sector y técnica próximamente.
            </p>
          </div>
        </section>
        <PortfolioGrid variant="full" />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
