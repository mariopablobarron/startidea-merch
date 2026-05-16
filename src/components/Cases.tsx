"use client";

import { motion, fadeUp, stagger, viewportOnce } from "./motion";

const CASES = [
  {
    sector: "Tecnológica · Madrid",
    headline: "Welcome pack para 120 nuevos empleados con producción 100% en CEE",
    impact: "318 horas de trabajo digno generadas",
    quote:
      "Pasamos de un proveedor estándar a un partner que entrega lo mismo, en plazo, y nos da material para nuestro reporte ESG.",
    author: "Dirección de Personas",
  },
  {
    sector: "Evento corporativo · Barcelona",
    headline: "1.200 botellas tritan personalizadas para feria sectorial en 9 días",
    impact: "Materiales 100% RPET · CO₂ -42% vs. plástico virgen",
    quote:
      "Plazo crítico, marcaje láser perfecto y cero incidencias en el evento. Ya estamos planificando el próximo.",
    author: "Marketing & Eventos",
  },
  {
    sector: "Universidad · Andalucía",
    headline: "Tote bags y libretas para campaña de bienvenida con bordado artesano local",
    impact: "Producción en cooperativa local · 4 puestos de trabajo",
    quote:
      "Queríamos que el merchandising contara una historia coherente con nuestra cátedra de economía social. Lo cuenta.",
    author: "Vicerrectorado de Estudiantes",
  },
];

export function Cases() {
  return (
    <section className="bg-ink py-24 text-bone lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.1)}
          className="max-w-3xl"
        >
          <motion.p
            variants={fadeUp}
            className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-bone/50"
          >
            — Casos de estudio
          </motion.p>
          <motion.h2 variants={fadeUp} className="font-display text-section font-semibold">
            Lo que ya hemos hecho<br />
            <span className="text-bone/50">con marcas como la tuya.</span>
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.1, 0.12)}
          className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {CASES.map((c, i) => (
            <motion.article
              key={i}
              variants={fadeUp}
              className="flex flex-col rounded-3xl border border-bone/10 bg-ink-soft p-8 transition hover:border-accent/40"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/50">
                {c.sector}
              </p>
              <h3 className="mt-5 font-display text-xl font-semibold leading-snug">
                {c.headline}
              </h3>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-social/15 px-3 py-1.5 text-xs text-social">
                <span className="h-1.5 w-1.5 rounded-full bg-social" />
                {c.impact}
              </p>
              <blockquote className="mt-6 flex-1 border-l-2 border-accent pl-4 text-[15px] italic text-bone/75">
                “{c.quote}”
              </blockquote>
              <p className="mt-4 text-sm text-bone/50">— {c.author}</p>
            </motion.article>
          ))}
        </motion.div>

        <p className="mt-12 text-sm text-bone/45">
          * Casos representativos de proyectos reales. Nombres anonimizados para respetar
          confidencialidad de cliente. Referencias completas disponibles bajo NDA.
        </p>
      </div>
    </section>
  );
}
