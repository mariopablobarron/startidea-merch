import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";
import { prisma } from "@/lib/prisma";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = await prisma.leadMagnet.findUnique({
    where: { slug },
    select: { title: true, description: true, heroUrl: true },
  });
  if (!m) return { title: "Recurso no encontrado" };
  return {
    title: `${m.title} · Descarga gratis`,
    description: m.description?.slice(0, 160) || `Descarga ${m.title} en PDF.`,
    alternates: { canonical: `${SITE_URL}/recursos/${slug}` },
    openGraph: {
      url: `${SITE_URL}/recursos/${slug}`,
      title: m.title,
      description: m.description || undefined,
      images: m.heroUrl ? [{ url: m.heroUrl }] : undefined,
    },
  };
}

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const magnet = await prisma.leadMagnet.findUnique({ where: { slug } });
  if (!magnet || !magnet.active) notFound();

  return (
    <>
      <Nav />
      <main>
        <section className="py-12 lg:py-20">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <nav className="mb-6 text-xs text-ink/50">
              <Link href="/recursos" className="hover:text-accent">
                ← Todos los recursos
              </Link>
            </nav>

            <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
              <div>
                {magnet.category && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                    {magnet.category}
                  </p>
                )}
                <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink lg:text-4xl">
                  {magnet.title}
                </h1>
                {magnet.description && (
                  <p className="mt-4 whitespace-pre-line text-base text-ink/75 lg:text-lg">
                    {magnet.description}
                  </p>
                )}
                {magnet.tags.length > 0 && (
                  <ul className="mt-5 flex flex-wrap gap-1.5">
                    {magnet.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-line bg-bone-soft px-2 py-0.5 text-[11px] text-ink/60"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-8 rounded-2xl border border-line bg-bone p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
                    Qué incluye
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-ink/75">
                    <li>📄 PDF de descarga inmediata</li>
                    <li>📧 Copia también a tu email</li>
                    <li>🎁 Sin spam · darte de baja con 1 click</li>
                  </ul>
                </div>
              </div>

              <aside className="lg:sticky lg:top-24 lg:self-start">
                {magnet.heroUrl && (
                  <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-3xl border border-line bg-bone-soft">
                    <Image
                      src={magnet.heroUrl}
                      alt=""
                      fill
                      sizes="(max-width:1024px) 100vw, 50vw"
                      className="object-cover"
                      priority
                      unoptimized
                    />
                  </div>
                )}
                <LeadMagnetForm slug={magnet.slug} title={magnet.title} />
              </aside>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
