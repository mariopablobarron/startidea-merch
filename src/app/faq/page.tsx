import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { FAQ_CATEGORIES, getAllFaqItems } from "@/lib/faqs-full";
import { NewsletterForm } from "@/components/NewsletterForm";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export const metadata: Metadata = {
  title: "Preguntas frecuentes · Cotización, plazos, materiales, marcaje",
  description:
    "Todas las preguntas frecuentes sobre merchandising corporativo B2B en TodoMerchandising: precio en tiempo real, plazos express, técnicas de marcaje, materiales, producción en Centros Especiales de Empleo, logística y garantías.",
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/faq`,
    title: "Preguntas frecuentes · TodoMerchandising",
    description:
      "Cotización, plazos, técnicas de marcaje, materiales, producción social, logística y garantías.",
    siteName: "TodoMerchandising",
    locale: "es_ES",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "FAQ TodoMerchandising" }],
  },
};

export default function FaqPage() {
  const allItems = getAllFaqItems();

  // Schema FAQPage gigante con TODAS las preguntas (Google muestra
  // rich result expandible directamente en SERP).
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allItems.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  const breadcrumbs = breadcrumbJsonLd([
    { name: "Inicio", url: "/" },
    { name: "Preguntas frecuentes", url: "/faq" },
  ]);

  return (
    <>
      <JsonLd data={[faqSchema, breadcrumbs] as never} />
      <Nav />
      <main className="bg-bone">
        {/* Hero */}
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Centro de respuestas
            </p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              Preguntas frecuentes
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/65 lg:text-lg">
              Lo que más nos preguntan empresas, eventos, ayuntamientos y
              departamentos de RR.HH. cuando hacen su primera cotización.
              {" "}
              <strong className="text-ink">{allItems.length} respuestas</strong>{" "}
              organizadas por categoría. Si la tuya no está aquí,{" "}
              <Link href="/#cotizar" className="text-accent hover:underline">
                escríbenos sin compromiso
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Tabla de contenidos */}
        <section className="border-b border-line bg-bone-soft py-10">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink/70">
              Categorías
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {FAQ_CATEGORIES.map((cat) => (
                <li key={cat.slug}>
                  <a
                    href={`#${cat.slug}`}
                    className="block rounded-xl border border-line bg-bone px-4 py-3 text-sm text-ink/80 transition hover:border-accent/40 hover:text-accent"
                  >
                    {cat.title}{" "}
                    <span className="text-ink/40">({cat.items.length})</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Categorías con preguntas */}
        {FAQ_CATEGORIES.map((cat) => (
          <section
            key={cat.slug}
            id={cat.slug}
            className="border-b border-line py-14 scroll-mt-24 lg:py-20"
          >
            <div className="mx-auto max-w-4xl px-6 lg:px-10">
              <h2 className="font-display text-2xl font-semibold text-ink lg:text-3xl">
                {cat.title}
              </h2>
              {cat.intro && (
                <p className="mt-3 max-w-3xl text-sm text-ink/65 lg:text-base">
                  {cat.intro}
                </p>
              )}
              <div className="mt-8 space-y-3">
                {cat.items.map((it, i) => (
                  <details
                    key={i}
                    className="group rounded-2xl border border-line bg-bone-soft p-5"
                  >
                    <summary className="cursor-pointer list-none font-display text-base font-semibold text-ink group-open:text-accent">
                      {it.q}
                    </summary>
                    <p className="mt-3 text-sm text-ink/75 lg:text-base">
                      {it.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* Newsletter signup pre-CTA */}
        <section className="border-b border-line bg-accent-wash/40 py-14 lg:py-16">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-deep">
              Boletín mensual
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Guías y casos reales en tu inbox
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-ink/65">
              Una guía al mes con plazos, cifras y casos reales del mercado del merchandising corporativo en España. Sin spam.
            </p>
            <div className="mt-6 max-w-md mx-auto">
              <NewsletterForm source="faq-bottom" />
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="py-14 lg:py-20">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <h2 className="font-display text-2xl font-semibold text-ink lg:text-3xl">
              ¿Tu pregunta no estaba aquí?
            </h2>
            <p className="mt-3 max-w-xl text-ink/65 mx-auto">
              Escríbenos por email o WhatsApp. Respondemos en menos de 4 h en horario laborable.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="mailto:pedidos@startidea.es"
                className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone hover:bg-accent-dark"
              >
                pedidos@startidea.es
              </a>
              <Link
                href="/catalogo"
                className="rounded-full border border-line bg-bone px-6 py-3 text-sm font-medium text-ink hover:border-accent"
              >
                Ver catálogo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
