"use client";

import { motion, fadeUp, stagger, viewportOnce } from "./motion";

import Link from "next/link";

const CATS = [
  { name: "Textil corporativo", desc: "Camisetas, polos, sudaderas, softshell.", price: "Desde 2,13 €", hint: "textil corporativo", searchQuery: "camiseta" },
  { name: "Bolsas & mochilas", desc: "Tote bags, bolsas técnicas, mochilas viaje.", price: "Desde 0,75 €", hint: "bolsas y mochilas personalizadas", searchQuery: "mochila" },
  { name: "Drinkware", desc: "Botellas tritan, acero inox, tazas, termos.", price: "Desde 1,40 €", hint: "drinkware", searchQuery: "botella" },
  { name: "Escritura", desc: "Bolígrafos eco, libretas, sets ejecutivos.", price: "Desde 0,25 €", hint: "escritura", searchQuery: "boligrafo" },
  { name: "Tecnología", desc: "Power banks, hubs, altavoces, cables.", price: "Desde 3,90 €", hint: "tecnología promocional", searchQuery: "power" },
  { name: "Eventos & ferias", desc: "Lanyards, acreditaciones, pulseras, banderines.", price: "Desde 0,18 €", hint: "eventos y ferias", searchQuery: "lanyard" },
  { name: "Hogar & lifestyle", desc: "Velas, plantas, cosmética, packs gourmet.", price: "Desde 4,50 €", hint: "hogar y lifestyle", searchQuery: "vela" },
  { name: "Regalos eco", desc: "Bambú, RPET, algodón orgánico, semilla.", price: "Desde 0,40 €", hint: "regalos eco", searchQuery: "bambu" },
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
              className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60"
            >
              — Catálogo
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
            Catálogo unificado de MidOcean (Makito en breve) — más de 2.000 referencias
            personalizables con stock europeo.{" "}
            <Link href="/catalogo" className="font-medium text-accent underline-offset-4 hover:underline">
              Explorar catálogo →
            </Link>
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.06)}
          className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-line bg-ink/10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {CATS.map((c) => (
            <motion.a
              key={c.name}
              variants={fadeUp}
              href={`/catalogo?q=${encodeURIComponent(c.searchQuery)}`}
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
