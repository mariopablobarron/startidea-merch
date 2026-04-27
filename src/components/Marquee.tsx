const ITEMS = [
  "Camisetas",
  "Botellas",
  "Sudaderas",
  "Mochilas",
  "Bolígrafos",
  "Libretas",
  "Tazas",
  "Gorras",
  "Llaveros",
  "Bolsas",
  "Polos",
  "Tecnología",
  "Eventos",
  "Regalos eco",
];

export function Marquee() {
  return (
    <section className="overflow-hidden border-y border-ink/10 bg-ink py-6 text-bone">
      <div className="marquee-track flex gap-12 whitespace-nowrap">
        {[...ITEMS, ...ITEMS, ...ITEMS].map((item, i) => (
          <span key={i} className="flex items-center gap-12 font-display text-2xl">
            {item}
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        ))}
      </div>
    </section>
  );
}
