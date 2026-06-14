/**
 * Trust strip — banda de confianza bajo el hero (patrón competidores top).
 * 4 promesas, con el impacto social integrado como diferencial (no como nota).
 * Server component, sin datos.
 */

const ITEMS: { title: string; sub: string; icon: React.ReactNode }[] = [
  {
    title: "Atención directa",
    sub: "Hablas con personas, no con un bot",
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
  },
  {
    title: "Cotización en 24 h",
    sub: "Precio cerrado, sin esperas",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    title: "Producción con impacto",
    sub: "En Centros Especiales de Empleo · Granada",
    icon: (
      <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
    ),
  },
  {
    title: "Envío a toda España",
    sub: "Con seguimiento de tu pedido",
    icon: (
      <>
        <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
        <circle cx="7" cy="17" r="1.6" />
        <circle cx="17" cy="17" r="1.6" />
      </>
    ),
  },
];

export function TrustStrip() {
  return (
    <section className="border-y border-line bg-bone-soft">
      <div className="mx-auto grid max-w-8xl grid-cols-2 px-6 py-5 sm:grid-cols-4 lg:px-10">
        {ITEMS.map((it) => (
          <div key={it.title} className="flex items-center gap-3 px-2 py-2">
            <svg
              className="h-6 w-6 shrink-0 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {it.icon}
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-ink">{it.title}</p>
              <p className="text-[12px] leading-tight text-ink/55">{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
