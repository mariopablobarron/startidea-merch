"use client";

import Link from "next/link";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";
import { Counter } from "./Counter";
import type { CtaLink } from "@/lib/site-settings";

const EUR_DECIMAL = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type HeroProps = {
  priceFromCents?: number;
  productCount?: number;
  // Copy editable desde /admin/marketing/site (con fallback hardcoded)
  badge?: string;
  h1Prefix?: string;
  h1Accent?: string; // soporta {price}
  subhead?: string; // soporta {count}
  ctaPrimary?: CtaLink;
  ctaSecondary?: CtaLink;
};

/**
 * Hero comercial con copy editable desde admin.
 * Si no llega prop de copy, usa fallbacks razonables.
 */
export function Hero({
  priceFromCents,
  productCount,
  badge = "Producción en Centros Especiales de Empleo",
  h1Prefix = "Merchandising corporativo personalizado",
  h1Accent = "desde {price} €/ud",
  subhead = "Camisetas, sudaderas, bolígrafos, mochilas, termos y +{count} productos más, con tu logo. Cotización en 24h. Producción que cambia vidas.",
  ctaPrimary = { label: "Ver catálogo →", href: "/catalogo" },
  ctaSecondary = { label: "Pedir cotización", href: "#cotizar" },
}: HeroProps) {
  const fromEur =
    typeof priceFromCents === "number" && priceFromCents > 0
      ? priceFromCents / 100
      : 0.3;
  const products = typeof productCount === "number" && productCount > 0 ? productCount : 2000;

  const priceStr = EUR_DECIMAL.format(fromEur);
  const countStr = products.toLocaleString("es-ES");

  // Interpolación de variables {price} y {count}
  const accent = h1Accent.replace("{price}", priceStr).replace("{count}", countStr);
  const sub = subhead.replace("{price}", priceStr).replace("{count}", countStr);

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
        <motion.p
          variants={fadeUp}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-ink/70"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-social" />
          {badge}
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="max-w-5xl font-display text-hero font-semibold text-ink"
        >
          {h1Prefix} <span className="text-accent">{accent}</span>.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-3xl text-lg text-ink/75 lg:text-xl"
        >
          {sub}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href={ctaPrimary.href}
            className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-bone shadow-lg shadow-accent/20 transition hover:bg-accent-dark"
          >
            {ctaPrimary.label}
          </Link>
          <Link
            href={ctaSecondary.href}
            className="rounded-full border border-line bg-bone-soft px-6 py-4 text-sm font-medium text-ink/70 transition hover:border-accent hover:text-ink"
          >
            {ctaSecondary.label}
          </Link>
        </motion.div>

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
