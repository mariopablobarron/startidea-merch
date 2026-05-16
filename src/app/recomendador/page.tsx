import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { Recommender } from "@/components/Recommender";

export const metadata: Metadata = {
  title: "Recomendador inteligente · Encuentra el merchandising perfecto",
  description:
    "Cuéntanos qué necesitas y nuestro asistente IA recomienda 3-5 productos del catálogo MidOcean en segundos. Brief libre, presupuesto, cantidad y filtro eco. Cotización humana en 24h.",
};

export default function RecomendadorPage() {
  return (
    <>
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
              Te quitamos el trabajo de filtrar 2.400+ productos. Cuéntanos público,
              cantidad, presupuesto y valores que quieres transmitir, y nuestro asistente
              elige los que mejor encajan. Después, un humano cierra la cotización en menos
              de 24 horas.
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
                title="Filtramos 2.400+ productos"
                text="El asistente revisa todo el catálogo en segundos y elige 3-5 productos que encajan, con justificación clara de por qué."
              />
              <Step
                num="3"
                title="Cotización humana en 24 h"
                text="Si te gusta una recomendación, pides cotización con un clic. Un humano cierra el precio final con marcaje, plazo y mockup."
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
