import type { ReactNode } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

type Faq = { q: string; a: string };

export function PillarShell({
  eyebrow,
  title,
  titleAccent,
  lead,
  tldr,
  children,
  faqs,
  ctaTitle,
  ctaSubtitle,
}: {
  eyebrow: string;
  title: string;
  titleAccent: string;
  lead: string;
  tldr: string[];
  children: ReactNode;
  faqs: Faq[];
  ctaTitle: string;
  ctaSubtitle: string;
}) {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        {/* Hero */}
        <section className="bg-bone">
          <div className="mx-auto max-w-4xl px-6 pt-16 pb-12">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">{eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold text-ink leading-tight md:text-5xl">
              {title}
              <br />
              <span className="text-accent">{titleAccent}</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/70 leading-relaxed">{lead}</p>
          </div>
        </section>

        {/* TL;DR */}
        <section className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-3xl border border-line bg-white p-6 md:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">— En 30 segundos</p>
            <ul className="mt-4 space-y-3">
              {tldr.map((t, i) => (
                <li key={i} className="flex gap-3 text-base text-ink/80 leading-relaxed">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Cuerpo del artículo */}
        <article className="prose-merch mx-auto max-w-3xl px-6 py-8">
          {children}
        </article>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Preguntas frecuentes</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Lo que más nos preguntan.</h2>
          <div className="mt-6 space-y-3">
            {faqs.map((f, i) => (
              <details key={i} className="rounded-2xl border border-line bg-white p-5">
                <summary className="cursor-pointer text-base font-semibold text-ink">{f.q}</summary>
                <p className="mt-3 text-sm text-ink/70 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-ink text-bone">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">— Siguiente paso</p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">{ctaTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75 leading-relaxed">{ctaSubtitle}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/cotizar"
                className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
              >
                Pedir cotización →
              </Link>
              <Link
                href="/recursos/calculadora-rsc"
                className="rounded-full border border-bone/30 px-6 py-3 text-sm font-semibold text-bone hover:border-bone/60"
              >
                Calcular ROI RSC →
              </Link>
              <Link
                href="/catalogo"
                className="rounded-full border border-bone/30 px-6 py-3 text-sm font-semibold text-bone hover:border-bone/60"
              >
                Ver catálogo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/**
 * JSON-LD FAQPage para rich snippets de Google.
 */
export function FaqJsonLd({ faqs }: { faqs: Faq[] }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
