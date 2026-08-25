import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { SECTORS } from "@/lib/sectors";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/jsonld";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export const metadata: Metadata = {
  title: "Merchandising por sector · Tech, eventos, retail, AAPP, RSC, RRHH",
  description:
    "Soluciones de merchandising corporativo adaptadas a cada sector: empresas tech, organizadores de eventos, retail, administración pública, departamentos RSC y RRHH.",
  alternates: { canonical: `${SITE_URL}/sectores` },
  openGraph: { url: `${SITE_URL}/sectores` },
};

export default function SectoresPage() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Inicio", url: "/" },
    { name: "Sectores", url: "/sectores" },
  ]);
  const collection = collectionPageJsonLd({
    name: "Merchandising por sector · TodoMerchandising",
    description:
      "Landings dedicadas a cada sector con casos reales, retos y productos recomendados.",
    url: `${SITE_URL}/sectores`,
    items: SECTORS.map((s) => ({
      name: `Merchandising para ${s.title}`,
      url: `${SITE_URL}/sectores/${s.slug}`,
    })),
  });

  return (
    <>
      <JsonLd data={[breadcrumbs, collection] as never} />
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Por sector
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Cada sector tiene su propio lenguaje. Hablamos los seis.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Tu equipo de RRHH no necesita lo mismo que tu equipo de marketing en feria. Un
              ayuntamiento no compra como un retail. Estos son los enfoques que aplicamos
              para cada cliente, con los productos que mejor encajan.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-6 lg:grid-cols-2">
              {SECTORS.map((s) => (
                <article
                  key={s.slug}
                  id={s.slug}
                  className="overflow-hidden rounded-3xl border border-line bg-bone p-7 lg:p-8"
                >
                  <header className="flex items-start gap-4">
                    <span className="text-4xl">{s.icon}</span>
                    <div>
                      <h2 className="font-display text-2xl font-semibold text-ink">
                        <Link href={`/sectores/${s.slug}`} className="hover:text-accent">
                          {s.title}
                        </Link>
                      </h2>
                      <p className="mt-1 text-sm text-ink/60">{s.short}</p>
                    </div>
                  </header>

                  <p className="mt-5 text-[14px] leading-relaxed text-ink/75">
                    {s.heroIntro.split(".")[0]}.
                  </p>

                  <p className="mt-6 text-xs font-medium uppercase tracking-wider text-ink/50">
                    Necesidades típicas
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {s.needs.slice(0, 3).map((n) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="text-ink/80">{n}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7 flex gap-3">
                    <Link
                      href={`/sectores/${s.slug}`}
                      className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone transition hover:bg-accent"
                    >
                      Ver enfoque completo →
                    </Link>
                    <Link
                      href={`/#cotizar?sector=${s.slug}`}
                      className="inline-flex items-center justify-center rounded-full border border-line bg-bone-soft px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent"
                    >
                      {s.cta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">
              ¿No te ves en ningún sector?
            </h2>
            <p className="mt-4 text-lg text-ink/70">
              No hay problema. Cuéntanos tu caso en una frase y nuestro asistente IA te
              propone 3-5 productos del catálogo en menos de 30 segundos.
            </p>
            <Link
              href="/recomendador"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-bone transition hover:bg-accent-dark"
            >
              Probar el recomendador IA →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
