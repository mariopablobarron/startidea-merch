"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "merch:tour-seen-v1";

type Step = {
  title: string;
  body: string;
  cta?: { label: string; href?: string };
};

const STEPS: Step[] = [
  {
    title: "Hola, primera vez aquí.",
    body:
      "TodoMerchandising es merchandising B2B con impacto social: cada pedido se produce en Centros Especiales de Empleo o talleres locales. Mismo precio que cualquier proveedor — con impacto que sí se mide.",
  },
  {
    title: "Más de 2.000 productos personalizables",
    body:
      "Catálogo conectado en directo con MidOcean. Stock europeo real, precios escalados por cantidad, áreas de marcaje detalladas. Búscalo por nombre, categoría, color o material.",
    cta: { label: "Abrir catálogo →", href: "/catalogo" },
  },
  {
    title: "¿No sabes qué buscas? Pídeselo a la IA",
    body:
      "Cuéntanos en una frase qué necesitas (público, cantidad, presupuesto, valores) y nuestro asistente IA elige 3-5 productos del catálogo que mejor encajan. En 30 segundos.",
    cta: { label: "Probar recomendador →", href: "/recomendador" },
  },
  {
    title: "Calculadora de marcaje en cada ficha",
    body:
      "Selecciona zona, técnica, cantidad y colores → ves el coste estimado al instante. Añade al carrito y manda cotización cerrada con un clic. Te respondemos en menos de 24 h.",
  },
];

export function OnboardingTour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Solo en home y solo primera vez
    if (pathname !== "/") return;
    // Skip en móvil: el tour tapa el hero y rompe la primera impresión.
    // En desktop hay espacio para mostrarlo; en móvil mejor no.
    if (window.matchMedia && window.matchMedia("(max-width: 767px)").matches) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen) return;
    } catch {
      return;
    }
    // Damos tiempo a que el visitante vea el hero antes (5s en desktop)
    const t = setTimeout(() => setOpen(true), 5000);
    return () => clearTimeout(t);
  }, [pathname]);

  function close() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    setOpen(false);
  }

  if (!open) return null;
  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-line bg-bone p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">
            Bienvenida · paso {step + 1}/{STEPS.length}
          </p>
          <button
            type="button"
            onClick={close}
            className="text-xs text-ink/40 hover:text-accent"
            aria-label="Cerrar tour"
          >
            ✕
          </button>
        </div>

        <h3 className="mt-3 font-display text-2xl font-semibold text-ink">{cur.title}</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/75">{cur.body}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {cur.cta?.href && (
            <a
              href={cur.cta.href}
              onClick={close}
              className="rounded-full border border-line bg-bone-soft px-4 py-2 text-xs font-medium hover:border-accent"
            >
              {cur.cta.label}
            </a>
          )}
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs"
              >
                ← Anterior
              </button>
            )}
            {last ? (
              <button
                type="button"
                onClick={close}
                className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-bone hover:bg-accent-dark"
              >
                Empezar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-bone hover:bg-accent"
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition ${
                i === step ? "w-6 bg-accent" : "w-1.5 bg-ink/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
