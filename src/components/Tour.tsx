"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour-steps";

/**
 * Tour guiado on-demand. Se dispara con evento global `tour:start` (lanzado
 * desde el botón TourLauncher en la navbar). NUNCA se abre automáticamente.
 *
 * Mecánica:
 *  - Spotlight: oscurece todo menos el target. Si no hay target → modal central.
 *  - Tooltip: caja flotante con título + body + controles, posicionada
 *    automáticamente respecto al target evitando salirse del viewport.
 *  - Si un paso requiere otra ruta (requiresPath), router.push antes de
 *    intentar localizar el target.
 *  - Cierre con tecla ESC, click en backdrop o botón 'Saltar tour'.
 *
 * Persistencia: marca `merch:tour-completed-v1` en localStorage al terminar
 * para futuras heurísticas (ej. mostrar tip "ya conoces la web"). No bloquea
 * volver a lanzarlo.
 */

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_WIDTH = 340;
const STORAGE_KEY = "merch:tour-completed-v1";

export function Tour() {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setStepIdx(0);
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
  }, []);

  // Listener evento global
  useEffect(() => {
    const onStart = () => {
      setStepIdx(0);
      setOpen(true);
    };
    window.addEventListener("tour:start", onStart);
    return () => window.removeEventListener("tour:start", onStart);
  }, []);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIdx]);

  const step = TOUR_STEPS[stepIdx];

  // Navegar a la ruta requerida antes de localizar el target
  useEffect(() => {
    if (!open || !step) return;
    if (step.requiresPath && pathname !== step.requiresPath) {
      router.push(step.requiresPath);
    }
  }, [open, step, pathname, router]);

  // Localizar el target y actualizar bounding rect en resize/scroll
  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null);
      return;
    }
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(step.target!);
      if (el) {
        // Scroll para asegurar que es visible
        const r = el.getBoundingClientRect();
        const offscreen = r.top < 64 || r.bottom > window.innerHeight - 16;
        if (offscreen) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };
    measure();
    // Re-measure tras posibles cambios de layout
    raf = window.setTimeout(measure, 400) as unknown as number;
    const onWin = () => measure();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.clearTimeout(raf);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, step, pathname]);

  function next() {
    if (stepIdx >= TOUR_STEPS.length - 1) {
      close();
      return;
    }
    setStepIdx(stepIdx + 1);
  }
  function prev() {
    if (stepIdx <= 0) return;
    setStepIdx(stepIdx - 1);
  }

  if (!mounted || !open || !step) return null;

  // Posición del tooltip
  const tooltipPos = computeTooltipPosition(targetRect, step.placement);

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === TOUR_STEPS.length - 1;
  const totalSteps = TOUR_STEPS.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tour guiado"
      className="fixed inset-0 z-[100]"
    >
      {/* Backdrop con recorte para spotlight */}
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
        onClick={close}
        style={
          targetRect
            ? {
                clipPath: `polygon(
                  0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                  ${targetRect.left - SPOTLIGHT_PADDING}px ${targetRect.top - SPOTLIGHT_PADDING}px,
                  ${targetRect.right + SPOTLIGHT_PADDING}px ${targetRect.top - SPOTLIGHT_PADDING}px,
                  ${targetRect.right + SPOTLIGHT_PADDING}px ${targetRect.bottom + SPOTLIGHT_PADDING}px,
                  ${targetRect.left - SPOTLIGHT_PADDING}px ${targetRect.bottom + SPOTLIGHT_PADDING}px,
                  ${targetRect.left - SPOTLIGHT_PADDING}px ${targetRect.top - SPOTLIGHT_PADDING}px
                )`,
              }
            : undefined
        }
      />

      {/* Anillo decorativo alrededor del target */}
      {targetRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-accent/70 transition-all duration-300"
          style={{
            left: targetRect.left - SPOTLIGHT_PADDING,
            top: targetRect.top - SPOTLIGHT_PADDING,
            width: targetRect.width + SPOTLIGHT_PADDING * 2,
            height: targetRect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute z-10 w-[340px] max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-bone p-5 shadow-2xl"
        style={tooltipPos}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">
            Paso {stepIdx + 1}/{totalSteps}
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

        <h3 className="mt-2 font-display text-xl font-semibold text-ink">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink/75">{step.body}</p>

        {/* Barra de progreso */}
        <div className="mt-4 flex gap-1">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition ${
                i <= stepIdx ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>

        {/* Controles */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={close}
            className="text-xs text-ink/50 hover:text-accent"
          >
            Saltar tour
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={prev}
                className="rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs hover:border-accent"
              >
                ← Anterior
              </button>
            )}
            {isLast ? (
              <Link
                href="/catalogo"
                onClick={close}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bone shadow hover:bg-accent-dark"
              >
                Ver catálogo →
              </Link>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-bone hover:bg-accent"
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Posición del tooltip: si hay target, intenta colocarse según placement
 * y reajusta si se sale del viewport. Si no hay target o placement=center,
 * lo centra.
 */
function computeTooltipPosition(
  rect: DOMRect | null,
  placement?: "top" | "bottom" | "left" | "right" | "center",
): React.CSSProperties {
  if (!rect || placement === "center") {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = TOOLTIP_WIDTH;
  // Altura estimada (no la conocemos exacta sin medir el DOM, usamos 250 como aprox)
  const h = 250;

  let top: number;
  let left: number;

  switch (placement) {
    case "top":
      top = rect.top - h - TOOLTIP_OFFSET;
      left = rect.left + rect.width / 2 - w / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - h / 2;
      left = rect.left - w - TOOLTIP_OFFSET;
      break;
    case "right":
      top = rect.top + rect.height / 2 - h / 2;
      left = rect.right + TOOLTIP_OFFSET;
      break;
    case "bottom":
    default:
      top = rect.bottom + TOOLTIP_OFFSET;
      left = rect.left + rect.width / 2 - w / 2;
      break;
  }

  // Clamp al viewport
  left = Math.max(16, Math.min(left, vw - w - 16));
  top = Math.max(16, Math.min(top, vh - h - 16));

  return { top, left };
}
