"use client";

import Link from "next/link";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-bone">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -top-40 left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={stagger(0.1, 0.12)}
        className="mx-auto max-w-8xl px-6 pb-24 pt-20 lg:px-10 lg:pb-36 lg:pt-28"
      >
        <motion.p
          variants={fadeUp}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-bone-soft px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-ink/70"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-social" />
          Merchandising con impacto social real
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="max-w-5xl font-display text-hero font-semibold text-ink"
        >
          Tu marca, en manos<br />
          que <span className="text-accent">cambian vidas</span>.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-2xl text-lg text-ink/75 lg:text-xl"
        >
          Producimos merchandising corporativo personalizado en Centros Especiales de Empleo
          y talleres locales. Mismo precio que cualquier proveedor — con impacto que sí se mide.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="#cotizar"
            className="rounded-full bg-ink px-8 py-4 text-base font-medium text-bone transition hover:bg-accent"
          >
            Pedir cotización en 24h
          </Link>
          <Link
            href="#impacto"
            className="rounded-full border border-ink/15 bg-bone-soft px-8 py-4 text-base font-medium text-ink transition hover:border-ink/40"
          >
            Cómo lo hacemos
          </Link>
        </motion.div>

        <motion.dl
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.1, 0.1)}
          className="mt-20 grid grid-cols-2 gap-8 border-t border-ink/10 pt-10 lg:grid-cols-4"
        >
          <Stat value="+10.000" label="Productos personalizables" />
          <Stat value="2" label="Proveedores europeos integrados" />
          <Stat value="100%" label="Producción con impacto social" />
          <Stat value="24h" label="Cotización garantizada" />
        </motion.dl>
      </motion.div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <motion.div variants={fadeUp}>
      <dt className="font-display text-4xl font-semibold tracking-tight text-ink lg:text-5xl">
        {value}
      </dt>
      <dd className="mt-2 text-sm text-ink/60">{label}</dd>
    </motion.div>
  );
}
