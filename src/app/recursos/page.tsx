import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

const BASE_METADATA: Metadata = {
  title: "Recursos · TodoMerchandising",
  description:
    "Guías, plantillas y checklists gratuitas sobre merchandising corporativo B2B. Descarga PDF.",
  alternates: { canonical: "https://merchandising.hubstartidea.es/recursos" },
};

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("/recursos");
  return mergeMetadata(BASE_METADATA, seo);
}

export const dynamic = "force-dynamic";

async function loadMagnets() {
  try {
    return await prisma.leadMagnet.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 30,
    });
  } catch {
    return [];
  }
}

/**
 * Guías técnicas con contenido HTML rico que NO requieren email para
 * acceder. Se listan arriba en la página de recursos como bloque propio,
 * complementario al listado de lead magnets en PDF.
 *
 * Para añadir una nueva: crea la página estática en src/app/recursos/<slug>/
 * y añade el descriptor aquí.
 */
const NAVIGABLE_GUIDES = [
  {
    slug: "guia-pantone-serigrafia-corporativa",
    href: "/recursos/guia-pantone-serigrafia-corporativa",
    category: "Color · Serigrafía",
    title: "Guía Pantone para serigrafía corporativa",
    description:
      "Tabla con 25 colores corporativos clásicos y equivalencias Pantone → CMYK → HEX → RGB. Cómo identificar el Pantone de tu logo y evitar que el rojo salga rosa.",
    cta: "Leer la guía",
  },
  {
    slug: "calculadora-rsc",
    href: "/recursos/calculadora-rsc",
    category: "Impacto · Calculadora",
    title: "Calculadora de impacto RSC del merch",
    description:
      "Cuantifica las horas de empleo en CEE y los kg de CO₂ evitados con tu pedido. Útil para reporting de sostenibilidad.",
    cta: "Calcular impacto",
  },
] as const;

export default async function RecursosPage() {
  const magnets = await loadMagnets();

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Recursos", url: "/recursos" }]) as never} />
      <Nav />
      <main>
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Recursos gratis
            </p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              Guías y plantillas de merchandising corporativo
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink/65 lg:text-lg">
              PDFs, guías navegables, calculadoras y plantillas. Lo que
              aprendemos produciendo pedidos B2B reales, condensado para que tu
              próximo pedido salga bien a la primera.
            </p>
          </div>
        </section>

        {/* Guías navegables (contenido HTML rico, sin gate de email) */}
        <section className="border-b border-line py-10 lg:py-14">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Guías técnicas · lectura directa
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              Para resolver tu duda sin descargar nada
            </h2>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {NAVIGABLE_GUIDES.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={g.href}
                    className="group flex h-full flex-col rounded-3xl border border-line bg-bone p-5 transition hover:border-accent/40 hover:shadow-lg"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-accent">
                      {g.category}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-semibold text-ink group-hover:text-accent">
                      {g.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink/65">
                      {g.description}
                    </p>
                    <p className="mt-4 text-xs font-medium text-accent">
                      {g.cta} →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Lead magnets (PDFs descargables con email gate) */}
        <section className="py-10 lg:py-14">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Descargas gratuitas · PDF
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              PDFs y plantillas para tu próximo pedido
            </h2>
            <p className="mt-3 text-sm text-ink/60">
              Dejas tu email y los recibes al instante. Sin spam.
            </p>
            {magnets.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-line bg-bone p-10 text-center text-sm text-ink/60">
                Pronto añadiremos los primeros recursos descargables.
              </p>
            ) : (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {magnets.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/recursos/${m.slug}`}
                      className="group block h-full rounded-3xl border border-line bg-bone p-5 transition hover:border-accent/40 hover:shadow-lg"
                    >
                      {m.heroUrl && (
                        <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-bone-soft">
                          <Image
                            src={m.heroUrl}
                            alt=""
                            fill
                            sizes="(max-width:768px) 100vw, 33vw"
                            className="object-cover transition group-hover:scale-105"
                            unoptimized
                          />
                          {m.featured && (
                            <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bone shadow">
                              ★ Destacado
                            </span>
                          )}
                        </div>
                      )}
                      {m.category && (
                        <p className="text-[10px] uppercase tracking-wider text-accent">
                          {m.category}
                        </p>
                      )}
                      <h2 className="mt-1 line-clamp-2 font-display text-lg font-semibold text-ink group-hover:text-accent">
                        {m.title}
                      </h2>
                      {m.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-ink/65">{m.description}</p>
                      )}
                      <p className="mt-4 text-xs font-medium text-accent">Descargar gratis →</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
