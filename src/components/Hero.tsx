"use client";

import Link from "next/link";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";
import { Counter } from "./Counter";

const EUR_DECIMAL = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Hero comercial: precio "desde €/ud" arriba para que un visitante con
 * intención de compra sepa en 3 segundos en qué rango está, sin perder
 * el alma social del proyecto (CEE = Centros Especiales de Empleo).
 *
 * Si llega `priceFromCents` (servidor lee mínimo real de productos), se
 * muestra el dato real. Si no, fallback "desde 0,30€/ud".
 */
export function Hero({
  priceFromCents,
  productCount,
}: {
  priceFromCents?: number;
  productCount?: number;
}) {
  const fromEur =
    typeof priceFromCents === "number" && priceFromCents > 0
      ? priceFromCents / 100
      : 0.3;
  const products = typeof productCount === "number" && productCount > 0 ? productCount : 2000;

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
        className="mx-auto max-w-8xl px-6 pb-20 pt-20 lg:px-10 lg:pb-28 lg:pt-28"
      >
        {/* Badge social pequeño arriba — diferenciador, no headline */}
        <motion.p
          variants={fadeUp}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-ink/70"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-social" />
          Producción en Centros Especiales de Empleo
        </motion.p>

        {/* H1 comercial: qué + para quién + precio */}
        <motion.h1
          variants={fadeUp}
          className="max-w-5xl font-display text-hero font-semibold text-ink"
        >
          Merchandising corporativo personalizado{" "}
          <span className="text-accent">desde {EUR_DECIMAL.format(fromEur)} €/ud</span>.
        </motion.h1>

        {/* Subhead con beneficios concretos en una línea */}
        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-3xl text-lg text-ink/75 lg:text-xl"
        >
          Camisetas, sudaderas, bolígrafos, mochilas, termos y +{products.toLocaleString("es-ES")} productos
          más, con tu logo. Cotización en 24h. Producción que cambia vidas.
        </motion.p>

        {/* CTA único primario + secundario discreto */}
        <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/catalogo"
            className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-bone shadow-lg shadow-accent/20 transition hover:bg-accent-dark"
          >
            Ver catálogo →
          </Link>
          <Link
            href="#cotizar"
            className="rounded-full border border-line bg-bone-soft px-6 py-4 text-sm font-medium text-ink/70 transition hover:border-accent hover:text-ink"
          >
            Pedir cotización
          </Link>
        </motion.div>

        {/* Trust signals: 4 stats que reducen incertidumbre */}
        <motion.dl
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.1, 0.1)}
          className="mt-16 grid grid-cols-2 gap-8 border-t border-line pt-10 lg:grid-cols-4"
        >
          <Stat label="Productos personalizables">
            <Counter value={products} prefix="+" />
          </Stat>
          <Stat label="Cotización garantizada">
            <Counter value={24} suffix="h" />
          </Stat>
          <Stat label="Producción con impacto">
            <Counter value={100} suffix="%" />
          </Stat>
          <Stat label="Datos fiscales en factura">
            <span className="text-ink">B2B</span>
          </Stat>
        </motion.dl>
      </motion.div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp}>
      <dt className="font-display text-4xl font-semibold tracking-tight text-ink lg:text-5xl">
        {children}
      </dt>
      <dd className="mt-2 text-sm text-ink/60">{label}</dd>
    </motion.div>
  );
}
