import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { NewsletterForm } from "@/components/NewsletterForm";
import { SECTORS, getSector } from "@/lib/sectors";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export function generateStaticParams() {
  return SECTORS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = getSector(slug);
  if (!s) return { title: "Sector no encontrado" };
  const url = `${SITE_URL}/sectores/${s.slug}`;
  const title = `Merchandising para ${s.title.toLowerCase()} · Casos reales y productos`;
  const description = s.heroIntro.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "TodoMerchandising",
      locale: "es_ES",
      // Usa el opengraph-image.tsx específico del sector (PNG por sector)
      images: [
        {
          url: `${SITE_URL}/sectores/${s.slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}/sectores/${s.slug}/opengraph-image`],
    },
  };
}

export default async function SectorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = getSector(slug);
  if (!s) notFound();

  const url = `${SITE_URL}/sectores/${s.slug}`;

  // JSON-LD: BreadcrumbList + Service + FAQPage (si hay FAQs)
  const schemas: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "Sectores",
          item: `${SITE_URL}/sectores`,
        },
        { "@type": "ListItem", position: 3, name: s.title, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `Merchandising para ${s.title}`,
      description: s.heroIntro.slice(0, 300),
      provider: {
        "@type": "Organization",
        name: "TodoMerchandising",
        url: SITE_URL,
      },
      areaServed: { "@type": "Country", name: "ES" },
      serviceType: "Merchandising corporativo",
      audience: { "@type": "BusinessAudience", audienceType: s.title },
      url,
      // Rango orientativo — Google muestra "Desde X €" en rich result
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: "0.50",
        highPrice: "150.00",
        offerCount: s.products.length,
        availability: "https://schema.org/InStock",
      },
    },
  ];
  if (s.faqs && s.faqs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: s.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return (
    <>
      <JsonLd data={schemas as never} />
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <Link href="/sectores" className="text-xs text-ink/60 hover:text-accent">
              ← Todos los sectores
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-5xl">{s.icon}</span>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                Sector
              </p>
            </div>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              {s.title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">{s.short}</p>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink/75">
              {s.heroIntro}
            </p>
            <Link
              href={`/#cotizar?sector=${s.slug}`}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
            >
              {s.cta} →
            </Link>
          </div>
        </section>

        {/* Retos */}
        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Lo que nos cuentan vuestros equipos
            </h2>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {s.challenges.map((c) => (
                <div key={c.title} className="rounded-3xl border border-line bg-bone p-7">
                  <p className="font-display text-xl font-semibold text-ink">{c.title}</p>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink/75">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo trabajamos para este sector */}
        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[1fr,1.4fr]">
              <div>
                <h2 className="font-display text-3xl font-semibold text-ink">
                  Cómo trabajamos para {s.title.toLowerCase()}
                </h2>
                <p className="mt-4 text-[15px] text-ink/70">
                  Trasladamos a tu sector las ventajas de tener producción nacional, stock
                  europeo y certificación social real:
                </p>
              </div>
              <ul className="space-y-4">
                {s.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3 rounded-2xl border border-line bg-bone-soft p-5">
                    <svg className="mt-1 h-5 w-5 shrink-0 text-social" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-sm text-ink/80">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Casos reales */}
        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Casos reales de este sector
            </h2>
            <p className="mt-3 text-sm text-ink/60">
              Anonimizados — pero todos producidos en los últimos 18 meses.
            </p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {s.realCases.map((c, i) => (
                <div key={i} className="rounded-3xl border border-line bg-bone p-7">
                  <p className="font-display text-4xl font-semibold text-accent">
                    0{i + 1}
                  </p>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink/80">{c}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Productos */}
        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Productos que mejor encajan
            </h2>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {s.products.map((p) => (
                <Link
                  key={p.q}
                  href={`/catalogo?q=${encodeURIComponent(p.q)}`}
                  className="rounded-2xl border border-line bg-bone-soft p-5 transition hover:border-accent hover:shadow-lg"
                >
                  <p className="font-display text-base font-semibold text-ink">{p.name}</p>
                  <p className="mt-2 text-xs text-accent">Ver en catálogo →</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Preguntas frecuentes
            </h2>
            <ul className="mt-10 space-y-5">
              {s.faqs.map((f, i) => (
                <li key={i} className="rounded-2xl border border-line bg-bone p-6">
                  <p className="font-display text-lg font-semibold text-ink">{f.q}</p>
                  <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink/75">
                    {f.a}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA final */}
        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">
              {s.cta}.
            </h2>
            <p className="mt-4 text-lg text-ink/70">
              Cuéntanos tu brief y te respondemos en menos de 24 horas con propuesta cerrada,
              mockup y plazo. Sin compromiso.
            </p>
            <Link
              href={`/#cotizar?sector=${s.slug}`}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-bone transition hover:bg-accent-dark"
            >
              Pedir cotización ahora →
            </Link>
            <p className="mt-3 text-xs text-ink/50">
              ¿Prefieres que el asistente IA elija por ti? <Link href="/recomendador" className="text-accent underline-offset-4 hover:underline">Probar recomendador</Link>.
            </p>
          </div>
        </section>

        {/* Newsletter signup — captura email de visitantes high-intent */}
        <section className="border-t border-line bg-accent-wash/40 py-14 lg:py-16">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-deep">
              Boletín mensual
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Casos y guías para {s.title.toLowerCase()}
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-ink/65">
              Una guía al mes con plazos, cifras y casos reales del merchandising B2B. Sin spam, una sola vez al mes.
            </p>
            <div className="mt-6 max-w-md mx-auto">
              <NewsletterForm source={`sector-${s.slug}`} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
