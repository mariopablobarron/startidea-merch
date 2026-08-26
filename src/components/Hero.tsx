"use client";

import Link from "next/link";
import { AskDiego } from "./AskDiego";
import { formatCatalogFloor } from "@/lib/catalog-count";

import { motion, fadeUp, stagger, viewportOnce } from "./motion";
import { Counter } from "./Counter";
import { NavSearch } from "./NavSearch";
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
 * Hero alineado con Manual de identidad Startidea v1.0:
 *  - Eyebrow con — guión largo (gesto editorial Startidea)
 *  - Display 72px máximo, mucho contraste de escala
 *  - Magenta solo como acento dentro del titular y en CTA primario
 *  - Sin blurs ni gradientes (manual prohíbe efectos)
 *  - Alineación a la izquierda, columna única
 *  - 3 stats grandes con labels cortos (estilo "15 / 90+ / 320+" de startidea.es)
 */
export function Hero({
  priceFromCents,
  productCount,
  badge = "Servicios / Merchandising corporativo",
  h1Prefix = "Merchandising con cabeza,",
  h1Accent = "desde {price} €/ud",
  subhead = "Te ayudamos a vestir tus equipos, presentar tu marca y crear regalos corporativos con sentido. Precio al instante en cada producto. Producción en Centros Especiales de Empleo.",
  ctaPrimary = { label: "Ver catálogo →", href: "/catalogo" },
  ctaSecondary = { label: "Cuéntanos tu proyecto", href: "#cotizar" },
}: HeroProps) {
  const fromEur =
    typeof priceFromCents === "number" && priceFromCents > 0
      ? priceFromCents / 100
      : 0.3;
  // Sin literal de reserva: `formatCatalogFloor` ya decide qué decir cuando no
  // hay recuento («miles de»), y así el hero no puede volver a discrepar de los
  // demás bloques de la misma home, que es justo lo que pasaba el 26-ago-2026.
  const countStr = formatCatalogFloor(productCount);

  const priceStr = EUR_DECIMAL.format(fromEur);

  // Interpolación de variables {price} y {count}
  const accent = h1Accent.replace("{price}", priceStr).replace("{count}", countStr);
  const sub = subhead.replace("{price}", priceStr).replace("{count}", countStr);

  return (
    <section className="bg-bone">
      <motion.div
        initial="hidden"
        animate="show"
        variants={stagger(0.1, 0.12)}
        className="mx-auto max-w-8xl px-6 pb-24 pt-24 lg:px-10 lg:pb-40 lg:pt-32"
      >
        {/* Eyebrow editorial — gesto Startidea (guión largo + categoría en caps) */}
        <motion.p
          variants={fadeUp}
          className="mb-10 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60"
        >
          — {badge}
        </motion.p>

        {/* Titular grande, alineación izquierda, una columna. El acento magenta
            va dentro del titular en una palabra clave, no en bloques masivos. */}
        <motion.h1
          variants={fadeUp}
          className="max-w-5xl font-display text-hero font-semibold leading-[1.02] tracking-tight text-ink"
        >
          {h1Prefix} <span className="text-accent">{accent}</span>.
        </motion.h1>

        {/* Buscador protagonista — con catálogo grande, la búsqueda manda.
            Va justo bajo el titular: es lo primero útil nada más entrar. */}
        <motion.div variants={fadeUp} className="mt-10 max-w-3xl">
          <NavSearch size="hero" />
        </motion.div>

        {/* Subhead corto. Una columna 50-65 caracteres por línea (manual §08). */}
        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-2xl text-base leading-relaxed text-ink/70 lg:text-lg"
        >
          {sub}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={ctaPrimary.href}
            className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-bone transition hover:bg-accent-dark"
          >
            {ctaPrimary.label}
          </Link>
          <Link
            href={ctaSecondary.href}
            className="rounded-full px-6 py-4 text-base font-medium text-ink/70 underline-offset-4 transition hover:text-ink hover:underline"
          >
            {ctaSecondary.label} →
          </Link>
        </motion.div>

        {/* Entrada directa a David — terciaria a propósito: el CTA primario
            sigue siendo único (regla de la casa). */}
        <motion.p variants={fadeUp} className="mt-4 text-sm text-ink/60">
          ¿Con prisa?{" "}
          <AskDiego
            label="Habla o escribe a David"
            context="El cliente acaba de llegar a la portada de TodoMerchandising y quiere ir rápido."
          />{" "}
          y ten precio en 2 minutos.
        </motion.p>

        {/* Stats — patrón "15 / 90+ / 320+" de startidea.es. 3 columnas
            con números enormes en grafito y eyebrow breve debajo. */}
        <motion.dl
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.1, 0.1)}
          className="mt-24 grid grid-cols-3 gap-6 border-t border-line pt-12 lg:gap-12"
        >
          <Stat label="Productos">
            {/* El contador anima hacia el recuento real; sin recuento (base de
                datos caída) no se inventa un número: se dice «miles». */}
            {typeof productCount === "number" && productCount > 0 ? (
              <Counter value={productCount} prefix="+" />
            ) : (
              <span className="font-display text-5xl font-semibold tracking-tight text-ink lg:text-6xl">
                miles
              </span>
            )}
          </Stat>
          <Stat label="Precio">
            <span className="font-display text-5xl font-semibold tracking-tight text-ink lg:text-6xl">
              al instante
            </span>
          </Stat>
          <Stat label="Producción en CEE">
            <Counter value={100} suffix="%" />
          </Stat>
        </motion.dl>
      </motion.div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp}>
      <dt className="font-display text-5xl font-semibold tracking-tight text-ink lg:text-6xl">
        {children}
      </dt>
      <dd className="mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/50">
        {label}
      </dd>
    </motion.div>
  );
}
