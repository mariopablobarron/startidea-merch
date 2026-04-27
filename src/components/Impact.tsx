import { Heart, Hammer, Sprout, Users } from "lucide-react";

const PILLARS = [
  {
    icon: Users,
    title: "Centros Especiales de Empleo",
    body: "Producción real en CEE: serigrafía, bordado, montaje, packaging. Cada pedido tuyo es una jornada de trabajo digno para personas con discapacidad.",
  },
  {
    icon: Hammer,
    title: "Talleres locales",
    body: "Colaboramos con artesanos y pequeños talleres en España para tiradas cortas, marcaje premium y producto único.",
  },
  {
    icon: Sprout,
    title: "Materiales responsables",
    body: "Algodón orgánico, RPET, bambú, tritan. Priorizamos referencias eco-certificadas siempre que la calidad acompañe.",
  },
  {
    icon: Heart,
    title: "Impacto medible",
    body: "Cada cotización incluye un informe: horas de trabajo digno generadas, kg de CO₂ evitados, % producido en CEE.",
  },
];

export function Impact() {
  return (
    <section id="impacto" className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-[1fr,1.4fr]">
          <div>
            <p className="mb-6 text-sm font-medium uppercase tracking-wider text-accent">
              Por qué existimos
            </p>
            <h2 className="font-display text-section font-semibold text-ink">
              El merchandising no tiene que ser ruido.<br />
              <span className="text-ink/50">Puede ser propósito.</span>
            </h2>
            <p className="mt-8 text-lg text-ink/70">
              Cada año se producen miles de millones de objetos promocionales sin alma.
              Nosotros canalizamos ese mismo presupuesto hacia quien más lo necesita —
              sin que pierdas calidad, plazo ni precio.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-3xl border border-ink/10 bg-bone-soft p-7 transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
              >
                <Icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-[15px] text-ink/70">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
