import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { Eye, Target, Compass } from "lucide-react";

export const metadata: Metadata = {
  title: "Sobre nosotros",
  description:
    "Somos todomerchandising, una iniciativa de Startidea. Producimos merchandising corporativo en CEE y talleres locales con trazabilidad total e impacto social medible.",
  alternates: { canonical: "https://merchandising.hubstartidea.es/sobre" },
};

const VALUES = [
  {
    icon: Eye,
    title: "Transparencia radical",
    body: "Sabes quién hace qué, dónde y en qué condiciones. Cada cotización lleva trazabilidad — no es marketing, es operativa diaria.",
  },
  {
    icon: Target,
    title: "Producción responsable",
    body: "Trabajamos con Centros Especiales de Empleo y talleres locales certificados. Producción nacional, plazos cerrados y materiales responsables.",
  },
  {
    icon: Compass,
    title: "Cero presión comercial",
    body: "No tenemos comerciales agresivos ni descuentos por urgencia falsa. Si no encajamos, te lo decimos. Si encajamos, lo notas.",
  },
];

export default function SobrePage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Sobre nosotros", url: "/sobre" }]) as never} />
      <Nav />
      <main className="bg-bone">
        <section className="bg-bone py-24 lg:py-36">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Sobre nosotros
            </p>
            <h1 className="font-display text-hero font-semibold text-ink">
              Una agencia de merchandising<br />
              que se atreve a <span className="text-accent">contar de dónde sale</span>.
            </h1>
            <p className="mt-10 max-w-3xl text-xl text-ink/75">
              todomerchandising nace dentro de Startidea con una idea simple: el merchandising
              corporativo mueve millones de euros al año en España y casi nadie pregunta dónde se
              produce. Nosotros sí. Y hemos construido la red para hacerlo donde más hace falta.
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-bone-soft py-20 lg:py-28">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">Cómo nos posicionamos</h2>
            <div className="mt-12 space-y-10 text-lg text-ink/80">
              <p>
                <strong className="text-ink">No somos los más baratos</strong>. Somos los que hacen
                que tu presupuesto de merchandising genere algo más que ruido visual. Mismo precio
                que cualquier proveedor convencional, pero el dinero pasa por sitios distintos.
              </p>
              <p>
                <strong className="text-ink">No somos sólo CEE</strong>. Combinamos producción
                en Centros Especiales de Empleo, talleres locales y proveedores europeos
                certificados para garantizar plazos, calidad y stock real.
              </p>
              <p>
                <strong className="text-ink">No prometemos imposibles</strong>. Si tu plazo es
                de 48h y la técnica que pides necesita una semana, te lo decimos antes de cotizar.
                Preferimos perder un pedido que entregar tarde.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-bone py-24 lg:py-36">
          <div className="mx-auto max-w-6xl px-6 lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">En qué creemos</h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {VALUES.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="rounded-3xl border border-line bg-bone-soft p-8 transition hover:border-accent/40"
                >
                  <Icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-[15px] text-ink/70">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink py-24 text-bone lg:py-36">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-section font-semibold">
              ¿Trabajas en una empresa<br />
              <span className="text-bone/50">que quiere merchandising con sentido?</span>
            </h2>
            <p className="mt-8 text-lg text-bone/70">
              Entra al catálogo, configura cantidad y marcaje, y verás precio al instante.
              Sin formularios, sin esperar.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/#cotizar"
                className="rounded-full bg-accent px-8 py-4 text-base font-medium text-bone transition hover:bg-accent-dark"
              >
                Pedir cotización
              </Link>
              <a
                href="mailto:pedidos@startidea.es"
                className="rounded-full border border-bone/20 px-8 py-4 text-base font-medium text-bone transition hover:border-bone/60"
              >
                Hablar con nosotros
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
