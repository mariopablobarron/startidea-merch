"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { motion, fadeUp, stagger, viewportOnce } from "./motion";
import { cn } from "@/lib/cn";

const FAQS = [
  {
    q: "¿Qué cantidades mínimas manejáis?",
    a: "Depende del producto y la técnica de marcaje. En textil suelen ser 25 unidades; en bolígrafos o tote bags trabajamos desde 50. Si el volumen es bajo te derivamos a un taller artesano local que sí puede asumirlo.",
  },
  {
    q: "¿En qué se nota que es producción con impacto?",
    a: "En que sí lo es. Trabajamos con Centros Especiales de Empleo y talleres locales con identidad real. Cada cotización viene con un informe de impacto: horas de trabajo digno, % producido en CEE y, cuando aplica, kg de CO₂ evitados frente a un proveedor estándar.",
  },
  {
    q: "¿Cuál es el plazo medio de entrega?",
    a: "Entre 7 y 15 días laborables según producto y técnica. Para urgencias trabajamos plazos express (3-5 días) sin coste adicional siempre que el stock acompañe. La cotización incluye plazo cerrado.",
  },
  {
    q: "¿Hacéis muestras antes del pedido?",
    a: "Sí. En pedidos a partir de 100 unidades enviamos una muestra física previa sin coste. Para tiradas más pequeñas hacemos prueba digital con simulación 3D del marcaje para validación antes de producir.",
  },
  {
    q: "¿Cómo gestionáis los logos y archivos de marca?",
    a: "Aceptamos SVG, AI, EPS o PDF vectorial. Si solo tienes PNG/JPG te lo vectorizamos sin coste. Todos los archivos se borran tras la entrega salvo que pidas conservarlos para futuros pedidos.",
  },
  {
    q: "¿Trabajáis con empresas pequeñas o solo con grandes?",
    a: "Sin mínimo de empresa. Atendemos desde startups con su primer evento hasta corporativos con campañas anuales. El proceso es el mismo: brief, cotización en 24h, producción con impacto, entrega + informe.",
  },
];

export function Faq() {
  return (
    <section className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-3xl px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.08)}
        >
          <motion.p
            variants={fadeUp}
            className="mb-6 text-sm font-medium uppercase tracking-wider text-accent"
          >
            Preguntas frecuentes
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="font-display text-section font-semibold text-ink"
          >
            Lo que más nos preguntan<br />
            <span className="text-ink/50">antes de cotizar.</span>
          </motion.h2>
        </motion.div>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={stagger(0.05, 0.06)}
          className="mt-14 divide-y divide-ink/10 border-y border-line"
        >
          {FAQS.map((f, i) => (
            <motion.li variants={fadeUp} key={i}>
              <FaqItem q={f.q} a={f.a} />
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="group flex w-full items-start gap-6 py-6 text-left transition lg:py-8"
      aria-expanded={open}
    >
      <span
        className={cn(
          "mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line transition",
          open && "rotate-45 border-accent bg-accent text-bone",
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="flex-1">
        <h3 className="font-display text-lg font-semibold text-ink lg:text-xl">{q}</h3>
        <div
          className={cn(
            "grid overflow-hidden transition-all duration-300 ease-out",
            open ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <p className="text-[15px] text-ink/70 lg:text-base">{a}</p>
          </div>
        </div>
      </div>
    </button>
  );
}
