import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PartnerApplicationForm } from "./PartnerApplicationForm";

export const metadata: Metadata = {
  title: "Programa de partners · 10% comisión por cada cliente · TodoMerchandising",
  description:
    "Recomienda TodoMerchandising a tus clientes corporativos. 10% de comisión sobre cada pedido cerrado, link único de tracking, dashboard transparente. Para agencias de eventos, consultoras RSC, asociaciones de empresas y profesionales B2B.",
};

export default function PartnersProgramaPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="bg-bone">
          <div className="mx-auto max-w-4xl px-6 pt-16 pb-12">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Programa de partners</p>
            <h1 className="mt-3 font-display text-4xl font-semibold text-ink leading-tight md:text-5xl">
              Recomienda merchandising serio.<br />
              <span className="text-accent">Cobra 10% sobre cada pedido cerrado.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/70 leading-relaxed">
              Si trabajas con empresas que necesitan merchandising — agencias de eventos,
              consultoras de sostenibilidad, asociaciones empresariales, fundaciones,
              profesionales freelance B2B — tienes una vía fácil para añadir ingresos
              residuales sin desviarte de tu negocio principal.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-12">
          <div className="grid gap-6 md:grid-cols-3">
            <Card
              icon="💼"
              title="10% sobre cada pedido cerrado"
              body="Comisión calculada sobre el importe que cobramos. No hay tope. Se devenga al confirmar pago y se liquida mensualmente."
            />
            <Card
              icon="🔗"
              title="Link único de tracking"
              body="Te damos un URL personalizado (ej. /?ref=tu-slug) y una cookie de 30 días. Cualquier cliente que llegue por ahí queda asociado a ti."
            />
            <Card
              icon="📊"
              title="Dashboard transparente"
              body="Ves en tiempo real cuántos leads has traído, cuántos han cerrado pedido, cuánto has devengado y cuándo se liquida."
            />
          </div>
        </section>

        <section className="bg-white border-y border-line py-14">
          <div className="mx-auto max-w-4xl px-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">— Por qué encaja</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">A quién buscamos como partner.</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Item title="Agencias de eventos corporativos">
                Tus clientes necesitan merch del evento. Sumas comisión sin desviar foco.
              </Item>
              <Item title="Consultoras de sostenibilidad / RSC">
                Tus clientes están obligados a reportar. Nuestra propuesta encaja directa
                en su memoria GRI/EFRAG.
              </Item>
              <Item title="Asociaciones y federaciones empresariales">
                Ofreces a tus asociados producción local + impacto medible. Buena
                comunicación para tu cuota.
              </Item>
              <Item title="Profesionales B2B freelance / consultores">
                Marketing, comunicación, RRHH, eventos. Si tu cliente tipo gasta en
                merch, sumas ingresos sin trabajo extra.
              </Item>
              <Item title="Fundaciones, ONG, cooperativas">
                Sus campañas necesitan merch coherente con su misión. Cierra el círculo.
              </Item>
              <Item title="Centros de formación, escuelas de negocio">
                Vuestros alumni gestionan presupuestos de empresa. Recomendación =
                comisión.
              </Item>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Solicitud</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Cuéntanos cómo trabajarías con nosotros.</h2>
          <p className="mt-3 text-base text-ink/70 leading-relaxed">
            No es selección estricta: revisamos cada solicitud manualmente para
            asegurarnos de que encaja con la propuesta de marca. Te respondemos en
            menos de 48 horas laborables.
          </p>
          <div className="mt-6">
            <PartnerApplicationForm />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20">
          <details className="rounded-2xl border border-line bg-white p-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink">¿Cómo y cuándo cobro la comisión?</summary>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              La comisión se devenga (status EARNED) al confirmar el pago del pedido.
              Liquidación mensual: el día 15 del mes siguiente al devengo, por
              transferencia bancaria. Sin importe mínimo de liquidación para los
              primeros 6 meses.
            </p>
          </details>
          <details className="mt-3 rounded-2xl border border-line bg-white p-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink">¿Qué cuenta como atribución?</summary>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Cualquier visita que llegue a través de tu link <code>?ref=tu-slug</code>{" "}
              queda registrada con cookie de 30 días. Si esa persona hace cotización
              y la cerramos en ese plazo, es atribuible a ti. También cuenta si
              te dejan tu nombre en el comentario del lead aunque hayan venido por
              otra vía.
            </p>
          </details>
          <details className="mt-3 rounded-2xl border border-line bg-white p-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink">¿Tengo que firmar algún contrato?</summary>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Sí, contrato de afiliado simple (1 página) con condiciones claras y
              opción de baja en cualquier momento. Se firma electrónicamente al
              aprobar tu solicitud.
            </p>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Card({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <p className="text-3xl">{icon}</p>
      <p className="mt-3 font-display text-lg font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink/65 leading-relaxed">{body}</p>
    </div>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-accent pl-4">
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink/65 leading-relaxed">{children}</p>
    </div>
  );
}
