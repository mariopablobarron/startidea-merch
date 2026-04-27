const STEPS = [
  {
    n: "01",
    title: "Brief",
    body: "Cuéntanos producto, cantidad, plazo y presupuesto. O déjanos elegir por ti según tu marca y propósito.",
  },
  {
    n: "02",
    title: "Cotización en 24h",
    body: "Catálogo de +10.000 referencias con precio cerrado. Marcaje incluido (serigrafía, bordado, láser, DTF).",
  },
  {
    n: "03",
    title: "Producción con impacto",
    body: "Asignamos cada pedido al CEE o taller local que mejor se ajusta. Te enviamos foto del proceso.",
  },
  {
    n: "04",
    title: "Entrega + informe social",
    body: "Recibes el pedido y un informe con las horas de trabajo digno que has generado.",
  },
];

export function Process() {
  return (
    <section id="como" className="bg-ink py-24 text-bone lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="max-w-3xl">
          <p className="mb-6 text-sm font-medium uppercase tracking-wider text-accent">
            Cómo trabajamos
          </p>
          <h2 className="font-display text-section font-semibold">
            Sin intermediarios opacos.<br />
            <span className="text-bone/50">Tú nos cuentas, nosotros lo hacemos.</span>
          </h2>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-3xl bg-bone/10 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-ink p-8 lg:p-10">
              <span className="font-display text-5xl font-semibold text-accent">{s.n}</span>
              <h3 className="mt-6 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-3 text-[15px] text-bone/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
