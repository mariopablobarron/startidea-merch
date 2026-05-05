import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { CartPage } from "@/components/CartPage";

export const metadata: Metadata = {
  title: "Carrito de cotización · Resumen y envío",
  description:
    "Revisa los productos que has añadido a tu cotización, ajusta cantidad y técnica de marcaje y envíanos el brief. Te responderemos en menos de 24 horas con presupuesto cerrado.",
  robots: { index: false, follow: true },
};

export default function CarritoPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-14 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-accent">
              Cotización
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Tu cesta de cotización.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Estos son los productos que has configurado. Ajusta cantidades, revisa el
              total orientativo y mándanoslo. Te respondemos en menos de 24 horas con
              presupuesto cerrado, mockup y plazo de entrega.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <CartPage />
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
