import { QuoteForm } from "./QuoteForm";

export function QuoteSection() {
  return (
    <section id="cotizar" className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-[1fr,1.4fr]">
          <div>
            <p className="mb-6 text-sm font-medium uppercase tracking-wider text-accent">
              Cotización
            </p>
            <h2 className="font-display text-section font-semibold text-ink">
              Cuéntanos qué necesitas.<br />
              <span className="text-ink/50">Te respondemos en 24h.</span>
            </h2>
            <ul className="mt-10 space-y-4 text-ink/70">
              <Bullet>Cotización cerrada con precio final, marcaje y plazos.</Bullet>
              <Bullet>Sin compromiso. Sin coste. Sin letra pequeña.</Bullet>
              <Bullet>Asignamos producción a CEE o taller local según pedido.</Bullet>
              <Bullet>Te enviamos informe de impacto social al entregar.</Bullet>
            </ul>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-bone-soft p-8 lg:p-12">
            <QuoteForm />
          </div>
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}
