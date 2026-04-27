const CATS = [
  { name: "Textil corporativo", desc: "Camisetas, polos, sudaderas, softshell.", price: "Desde 2,13 €" },
  { name: "Bolsas & mochilas", desc: "Tote bags, bolsas técnicas, mochilas viaje.", price: "Desde 0,75 €" },
  { name: "Drinkware", desc: "Botellas tritan, acero inox, tazas, termos.", price: "Desde 1,40 €" },
  { name: "Escritura", desc: "Bolígrafos eco, libretas, sets ejecutivos.", price: "Desde 0,25 €" },
  { name: "Tecnología", desc: "Power banks, hubs, altavoces, cables.", price: "Desde 3,90 €" },
  { name: "Eventos & ferias", desc: "Lanyards, acreditaciones, pulseras, banderines.", price: "Desde 0,18 €" },
  { name: "Hogar & lifestyle", desc: "Velas, plantas, cosmética, packs gourmet.", price: "Desde 4,50 €" },
  { name: "Regalos eco", desc: "Bambú, RPET, algodón orgánico, semilla.", price: "Desde 0,40 €" },
];

export function Categories() {
  return (
    <section id="productos" className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="flex flex-col items-end justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="mb-6 text-sm font-medium uppercase tracking-wider text-accent">
              Catálogo
            </p>
            <h2 className="font-display text-section font-semibold text-ink">
              Cualquier producto promocional<br />
              que <span className="text-accent">se te ocurra</span>.
            </h2>
          </div>
          <p className="max-w-md text-ink/60">
            Catálogo unificado de Makito y MidOcean — más de 10.000 referencias personalizables
            con stock europeo. Próximamente navegable. Hoy, pídelo por brief.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
          {CATS.map((c) => (
            <article
              key={c.name}
              className="group bg-bone-soft p-7 transition hover:bg-ink hover:text-bone"
            >
              <h3 className="font-display text-lg font-semibold">{c.name}</h3>
              <p className="mt-3 text-sm opacity-70">{c.desc}</p>
              <p className="mt-6 text-xs uppercase tracking-wider text-accent">{c.price}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
