import Link from "next/link";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="bg-bone py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-6 lg:px-10">
          <Link href="/" className="text-sm text-ink/60 hover:text-accent">
            ← Volver al inicio
          </Link>
          <h1 className="mt-6 font-display text-section font-semibold text-ink">{title}</h1>
          <p className="mt-3 text-sm text-ink/50">Última actualización: {updatedAt}</p>
          <div className="prose prose-lg mt-12 max-w-none text-ink/80 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mt-12 [&_h2]:mb-4 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-8 [&_h3]:mb-3 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1 [&_a]:text-accent [&_a]:underline-offset-4 hover:[&_a]:underline">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
