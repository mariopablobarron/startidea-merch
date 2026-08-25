import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

/**
 * El 404 servía el `<title>` de la home ("TodoMerchandising — Merchandising con
 * impacto social", medido en producción el 26-ago-2026): una pestaña, un
 * marcador o un enlace compartido de una URL rota se presentaban como si fueran
 * la portada. Next resuelve el metadata de `not-found` como último eslabón de
 * la cadena, así que lo que se declare aquí gana sobre el layout raíz.
 *
 * El `noindex` es explícito a propósito. Next ya emite el suyo para el 404,
 * pero el layout declara `robots: { index: true, follow: true }` y el HTML
 * acababa sirviendo las DOS etiquetas: `noindex` y `index, follow`. Google
 * resuelve la contradicción por la más restrictiva —de ahí que el 404 no se
 * indexara—, pero una señal contradictoria no es una señal correcta.
 */
export const metadata: Metadata = {
  title: "Página no encontrada",
  description:
    "La página que buscas no existe o ha cambiado de dirección. Busca lo que necesitas desde el catálogo.",
  robots: { index: false, follow: true },
};

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
            Quizá pediste algo que aún no tenemos en el catálogo. Búscalo desde el catálogo —
            verás precio al instante.
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
