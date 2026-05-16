"use client";

import Link from "next/link";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";

/**
 * Bloque de cierre editorial — replica el patrón de startidea.es:
 * "La innovación social no es una etiqueta. Es lo que sale cuando
 *  das forma a una idea."
 *
 * Manual de identidad Startidea v1.0 §08 (Jerarquía y composición):
 *  - Fondo grafito (30% peso visual de la página)
 *  - Display 72px, magenta acento en palabras clave dentro del titular
 *  - Mucho aire arriba y abajo
 *  - Alineación a la izquierda, columna única
 *  - Frase corta, gesto fuerte
 */
export function ClosingStatement() {
  return (
    <section className="bg-ink text-bone">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        variants={stagger(0.1, 0.12)}
        className="mx-auto max-w-8xl px-6 py-28 lg:px-10 lg:py-40"
      >
        <motion.p
          variants={fadeUp}
          className="mb-12 text-[11px] font-medium uppercase tracking-[0.18em] text-bone/50"
        >
          — Lo que nos mueve
        </motion.p>

        <motion.h2
          variants={fadeUp}
          className="max-w-5xl font-display text-hero font-semibold leading-[1.02] tracking-tight"
        >
          El merchandising no es un{" "}
          <span className="text-bone/40">trámite</span>.
          <br />
          Es una <span className="text-accent">decisión</span>.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="mt-10 max-w-2xl text-base leading-relaxed text-bone/70 lg:text-lg"
        >
          Cada bolígrafo, camiseta o bolsa que repartes dice algo sobre tu marca
          y sobre el mundo que ayudas a construir. Nosotros nos ocupamos de que
          ese mensaje sea coherente — sin que pierdas plazo, calidad ni precio.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            href="#cotizar"
            className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-bone transition hover:bg-accent-dark"
          >
            Cuéntanos tu proyecto →
          </Link>
          <Link
            href="/catalogo"
            className="rounded-full px-6 py-4 text-base font-medium text-bone/70 underline-offset-4 transition hover:text-bone hover:underline"
          >
            Ver catálogo →
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
