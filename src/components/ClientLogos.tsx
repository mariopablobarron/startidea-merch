"use client";

import Image from "next/image";
import { motion, fadeUp, viewportOnce } from "./motion";
import { CLIENT_LOGOS } from "@/lib/client-logos";

/**
 * Banda de logos de clientes — trust signal clave above-the-fold.
 *
 * Solo renderiza si hay al menos 1 logo en CLIENT_LOGOS (lib). Si no, oculta
 * la sección por completo (mejor que mostrar un "próximamente" vacío).
 *
 * Para añadir clientes ver instrucciones en src/lib/client-logos.ts.
 */
export function ClientLogos() {
  if (CLIENT_LOGOS.length === 0) return null;

  return (
    <section
      aria-labelledby="clients-title"
      className="border-t border-line bg-bone py-12 lg:py-16"
    >
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <motion.p
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={fadeUp}
          id="clients-title"
          className="text-center text-xs font-medium uppercase tracking-[0.2em] text-ink/50"
        >
          Confían en nosotros
        </motion.p>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={fadeUp}
          role="list"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 lg:gap-x-16"
        >
          {CLIENT_LOGOS.map((c) => {
            const img = (
              <Image
                src={c.src}
                alt={c.alt ?? c.name}
                width={c.width}
                height={c.height}
                className="h-8 w-auto opacity-50 grayscale transition hover:opacity-100 hover:grayscale-0 lg:h-10"
                loading="lazy"
              />
            );
            return (
              <li key={c.name}>
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener nofollow"
                    aria-label={`Sitio web de ${c.name}`}
                  >
                    {img}
                  </a>
                ) : (
                  <span aria-label={c.name}>{img}</span>
                )}
              </li>
            );
          })}
        </motion.ul>
      </div>
    </section>
  );
}
