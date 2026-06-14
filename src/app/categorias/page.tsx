import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { prisma } from "@/lib/prisma";
import { breadcrumbJsonLd } from "@/lib/jsonld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Categorías de merchandising personalizable",
  description:
    "Todas las categorías de merchandising corporativo personalizable: textil, drinkware, escritura, tecnología, eventos y más. Producción con impacto social en Granada.",
  alternates: { canonical: `${SITE_URL}/categorias` },
};

export default async function CategoriasIndexPage() {
  const categories = await prisma.category.findMany({
    where: {
      level: 1,
      OR: [
        { products: { some: { active: true } } },
        { children: { some: { products: { some: { active: true } } } } },
        { children: { some: { children: { some: { products: { some: { active: true } } } } } } },
      ],
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { active: true } } } } },
  });

  const breadcrumb = breadcrumbJsonLd([
    { name: "Inicio", url: "/" },
    { name: "Categorías", url: "/categorias" },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb as never} />
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-line bg-bone py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Catálogo</p>
            <h1 className="font-display text-section font-semibold text-ink">
              Categorías de merchandising
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/70 lg:text-lg">
              Explora el catálogo por categoría. Todo se personaliza con tu logo y se produce en
              Centros Especiales de Empleo y talleres locales de Granada.
            </p>
          </div>
        </section>

        <section className="bg-bone py-10 lg:py-12">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            {categories.length === 0 ? (
              <p className="text-ink/60">Catálogo sincronizando…</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categorias/${c.slug}`}
                    className="group flex items-center justify-between rounded-2xl border border-line bg-bone-soft px-5 py-4 transition hover:border-accent/50"
                  >
                    <span className="font-display text-base font-semibold text-ink">{c.name}</span>
                    <span className="text-xs tabular-nums text-ink/50 group-hover:text-accent">
                      {c._count?.products ? `${c._count.products}` : ""} →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
