"use client";

import { MapPin } from "lucide-react";
import { PARTNERS_SEED } from "@/lib/partners";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";

const KIND_LABEL: Record<string, string> = {
  CEE: "Centro Especial de Empleo",
  LOCAL_BUSINESS: "Taller local",
  ARTISAN: "Artesano",
};

export function Partners() {
  return (
    <section id="hecho-con" className="bg-bone-soft py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.08)}
          className="grid gap-12 lg:grid-cols-[1fr,1.4fr] lg:items-end"
        >
          <div>
            <motion.p
              variants={fadeUp}
              className="mb-6 text-sm font-medium uppercase tracking-wider text-accent"
            >
              Hecho con
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="font-display text-section font-semibold text-ink"
            >
              Personas reales,<br />
              <span className="text-accent">talleres reales</span>.
            </motion.h2>
          </div>
          <motion.p variants={fadeUp} className="max-w-2xl text-lg text-ink/70">
            Cada pedido se asigna al CEE o taller que mejor encaja por técnica, plazo y volumen.
            En la entrega te decimos qué equipo lo produjo y cuántas horas de trabajo digno
            generó.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.1, 0.1)}
          className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {PARTNERS_SEED.map((p) => (
            <motion.article
              key={p.slug}
              variants={fadeUp}
              className="group flex flex-col rounded-3xl border border-line bg-bone p-7 transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
            >
              <span className="inline-flex w-fit items-center rounded-full bg-ink/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-ink/60">
                {KIND_LABEL[p.kind]}
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-ink">{p.name}</h3>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink/60">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                {p.city}, {p.region}
              </p>
              <p className="mt-4 text-[15px] text-ink/75">{p.description}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {p.services.map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink/70"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>

        <p className="mt-12 max-w-3xl text-sm text-ink/55">
          Red en crecimiento. Si representas un CEE, taller local o cooperativa de inserción
          y quieres colaborar, escríbenos a{" "}
          <a
            href="mailto:pedidos@startidea.es"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            pedidos@startidea.es
          </a>
          .
        </p>
      </div>
    </section>
  );
}
