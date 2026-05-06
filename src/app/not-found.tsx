import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="grid min-h-[70vh] place-items-center bg-bone px-6 py-24">
        <div className="text-center">
          <p className="font-display text-[8rem] font-semibold leading-none text-accent lg:text-[12rem]">
            404
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink lg:text-4xl">
            No hemos producido esta página todavía.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-ink/60">
            Quizá pediste algo que aún no tenemos en el catálogo. Cuéntanos qué buscas y lo
            cotizamos en 24h.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-bone transition hover:bg-accent"
            >
              Volver al inicio
            </Link>
            <Link
              href="/#cotizar"
              className="rounded-full border border-line bg-bone-soft px-7 py-3.5 text-sm font-medium text-ink transition hover:border-accent"
            >
              Pedir cotización
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
