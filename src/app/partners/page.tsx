import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Programa de partners · TodoMerchandising",
  description:
    "Comisiona el 10% de cada pedido que recomiendes. Sin requisitos mínimos. Para consultoras, agencias creativas, gestorías y profesionales con clientes B2B.",
};

export default function PartnersPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-16 lg:py-24">
          <div className="mx-auto max-w-3xl px-6 lg:px-10">
            <p className="text-sm font-medium uppercase tracking-wider text-accent">
              Programa de partners
            </p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              Comisiona un 10% por cada cliente que nos recomiendes.
            </h1>
            <p className="mt-4 text-lg text-ink/70">
              Si trabajas con empresas que necesitan merchandising —consultoras de RSC,
              agencias creativas, organizadores de eventos, gestorías, freelancers
              comerciales— y quieres derivarles producción con impacto social real, esto
              encaja.
            </p>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-3xl space-y-10 px-6 lg:px-10">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Cómo funciona</h2>
              <ol className="mt-4 space-y-3 text-[15px] text-ink/75">
                <li>
                  <strong className="text-ink">1. Te damos un código personal</strong>{" "}
                  (<code className="rounded bg-bone px-1.5">?ref=tu-slug</code>) y un material
                  comercial básico para enseñar a tus clientes.
                </li>
                <li>
                  <strong className="text-ink">2. Tu cliente entra en la web por tu link</strong>{" "}
                  y pide cotización con normalidad. Nosotros nos encargamos: brief,
                  cotización cerrada, mockup, producción y entrega.
                </li>
                <li>
                  <strong className="text-ink">3. Cuando el cliente paga,</strong> tú cobras el
                  10% del pedido (sin IVA) a los 30 días siguientes a la entrega. Pago por
                  transferencia.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Qué te ofrecemos</h2>
              <ul className="mt-4 space-y-2 text-[15px] text-ink/75">
                <li>• Comisión real del 10% sobre el pedido (sin letra pequeña ni umbrales).</li>
                <li>• Dashboard privado con tus referidos y cobros pendientes.</li>
                <li>• Material comercial: deck PDF, casos reales, fotos.</li>
                <li>• Soporte humano: tu cliente nunca habla con un bot.</li>
                <li>• Cero exclusividad, cero compromisos. Si no derivas, no pasa nada.</li>
              </ul>
            </div>

            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Quiero apuntarme</h2>
              <p className="mt-3 text-[15px] text-ink/75">
                Escríbenos a{" "}
                <a href="mailto:pedidos@startidea.es?subject=Programa%20de%20partners" className="text-accent underline-offset-4 hover:underline">
                  pedidos@startidea.es
                </a>{" "}
                con tu nombre, perfil profesional y tipo de clientes que llevas. En 48 h te damos
                de alta o te decimos honestamente si no encaja.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
