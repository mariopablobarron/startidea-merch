"use client";

import { motion, fadeUp, stagger, viewportOnce } from "./motion";

const CATS = [
  { name: "Textil corporativo", desc: "Camisetas, polos, sudaderas, softshell.", price: "Desde 2,13 €", hint: "textil corporativo (camisetas, polos, sudaderas)" },
  { name: "Bolsas & mochilas", desc: "Tote bags, bolsas técnicas, mochilas viaje.", price: "Desde 0,75 €", hint: "bolsas y mochilas personalizadas" },
  { name: "Drinkware", desc: "Botellas tritan, acero inox, tazas, termos.", price: "Desde 1,40 €", hint: "drinkware (botellas, tazas, termos)" },
  { name: "Escritura", desc: "Bolígrafos eco, libretas, sets ejecutivos.", price: "Desde 0,25 €", hint: "escritura (bolígrafos, libretas)" },
  { name: "Tecnología", desc: "Power banks, hubs, altavoces, cables.", price: "Desde 3,90 €", hint: "tecnología promocional" },
  { name: "Eventos & ferias", desc: "Lanyards, acreditaciones, pulseras, banderines.", price: "Desde 0,18 €", hint: "eventos y ferias (lanyards, pulseras)" },
  { name: "Hogar & lifestyle", desc: "Velas, plantas, cosmética, packs gourmet.", price: "Desde 4,50 €", hint: "hogar y lifestyle" },
  { name: "Regalos eco", desc: "Bambú, RPET, algodón orgánico, semilla.", price: "Desde 0,40 €", hint: "regalos eco (bambú, RPET, orgánico)" },
];

export function Categories() {
  return (
    <section id="productos" className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.1)}
          className="flex flex-col items-end justify-between gap-6 lg:flex-row lg:items-end"
        >
          <div className="max-w-2xl">
            <motion.p
              variants={fadeUp}
              className="mb-6 text-sm font-medium uppercase tracking-wider text-accent"
            >
              Catálogo
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="font-display text-section font-semibold text-ink"
            >
              Cualquier producto promocional<br />
              que <span className="text-accent">se te ocurra</span>.
            </motion.h2>
          </div>
          <motion.p variants={fadeUp} className="max-w-md text-ink/60">
            Catálogo unificado de Makito y MidOcean — más de 10.000 referencias personalizables
            con stock europeo. Próximamente navegable. Hoy, pídelo por brief.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.06)}
          className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CATS.map((c) => (
            <motion.a
              key={c.name}
              variants={fadeUp}
              href={`#cotizar?product=${encodeURIComponent(c.hint)}`}
              onClick={(e) => {
                e.preventDefault();
                const ev = new CustomEvent("merch:prefill-product", { detail: c.hint });
                window.dispatchEvent(ev);
                document.getElementById("cotizar")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="group block bg-bone-soft p-7 text-left transition hover:bg-ink hover:text-bone"
            >
              <h3 className="font-display text-lg font-semibold">{c.name}</h3>
              <p className="mt-3 text-sm opacity-70">{c.desc}</p>
              <p className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
                {c.price}
                <span className="opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                  →
                </span>
              </p>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
