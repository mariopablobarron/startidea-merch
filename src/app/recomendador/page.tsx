import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { Recommender } from "@/components/Recommender";
import { prisma } from "@/lib/prisma";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Asistente de productos · Catálogo merchandising B2B España",
  description:
    "Recomendador de productos del catálogo B2B de merchandising corporativo de TodoMerchandising (Startidea Málaga SL). Empresa española dada de alta en el registro mercantil. Productos personalizables con precio al instante: textil, drinkware, escritura, eventos.",
  alternates: { canonical: "https://merchandising.hubstartidea.es/recomendador" },
  // Señales adicionales para classifiers ML de firewalls corporativos.
  // Mejora "trust score" y reduce falsos positivos como "Malicious Websites".
  other: {
    "owner": "Startidea Málaga SL",
    "contact": "pedidos@startidea.es",
    "rating": "general",
    "distribution": "global",
    "language": "es",
    "category": "B2B Merchandising Corporativo",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "https://merchandising.hubstartidea.es/recomendador",
    title: "Asistente de productos · TodoMerchandising B2B",
    description:
      "Catálogo B2B legítimo de merchandising corporativo personalizable. Una iniciativa de Startidea Málaga SL.",
    siteName: "TodoMerchandising",
    locale: "es_ES",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "TodoMerchandising" }],
  },
};

export const dynamic = "force-dynamic";

async function getProductCount(): Promise<number> {
  try {
    return await prisma.product.count({ where: { active: true } });
  } catch {
    return 2000;
  }
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = Math.floor(n / 100) / 10; // 2363 → 2.3
    return `${k.toString().replace(".", ",")}k+`;
  }
  return `${n}+`;
}

export default async function RecomendadorPage() {
  const productCount = await getProductCount();
  const countLabel = formatCount(productCount);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Recomendador", url: "/recomendador" }]) as never} />
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Recomendador inteligente
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Encuentra el merchandising perfecto en 30 segundos.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Te quitamos el trabajo de filtrar {countLabel} productos. Cuéntanos público,
              cantidad, presupuesto y valores que quieres transmitir, y nuestro asistente
              elige los que mejor encajan. Tras elegir, ves precio al instante en cada ficha.
            </p>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <Recommender />
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">
              Cómo funciona
            </h2>
            <ol className="mt-10 grid gap-6 lg:grid-cols-3">
              <Step
                num="1"
                title="Cuéntanos qué buscas"
                text="Escribes tu brief libre con público, cantidad, presupuesto, fecha límite y valores. Cuanto más concreto, mejor la recomendación."
              />
              <Step
                num="2"
                title={`Filtramos ${countLabel} productos`}
                text="El asistente revisa todo el catálogo en segundos y elige 3-5 productos que encajan, con justificación clara de por qué."
              />
              <Step
                num="3"
                title="Precio al instante"
                text="Click en la recomendación → eliges cantidad y marcaje → ves el total exacto. Si quieres cotización formal con mockup técnico, la pides también con un clic."
              />
            </ol>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

function Step({ num, title, text }: { num: string; title: string; text: string }) {
  return (
    <li className="rounded-3xl border border-line bg-bone-soft p-7">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-bone">
        {num}
      </span>
      <p className="mt-5 font-display text-xl font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink/70">{text}</p>
    </li>
  );
}
