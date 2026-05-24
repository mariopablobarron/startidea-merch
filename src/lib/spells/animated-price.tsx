"use client";

/**
 * Spell A2 — Precio fluido entre tiers.
 *
 * Componente <AnimatedPrice/> que interpola numéricamente entre el valor
 * previo y el nuevo cuando cambia. Da sensación de "el descuento llegando"
 * en lugar de un salto brusco.
 *
 * Sin dependencias (no framer-motion). Usa requestAnimationFrame y respeta
 * prefers-reduced-motion.
 *
 * Uso:
 *   <AnimatedPrice cents={totalCents} format={(c) => formatMoney(c).formatted} />
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Valor en céntimos. null/undefined → muestra placeholder */
  cents: number | null | undefined;
  /** Formatter (típicamente formatMoney(cents).formatted) */
  format: (cents: number) => string;
  /** Placeholder cuando cents es null/undefined */
  placeholder?: string;
  /** Duración interpolación en ms (default 350) */
  duration?: number;
  /** Clases extra */
  className?: string;
};

// Ease-out cubic: arranque rápido, llegada suave (sensación "asentándose")
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedPrice({
  cents,
  format,
  placeholder = "—",
  duration = 350,
  className,
}: Props) {
  const [display, setDisplay] = useState<number | null>(
    typeof cents === "number" ? cents : null,
  );
  const fromRef = useRef<number>(typeof cents === "number" ? cents : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Si no hay valor o nunca hubo, simplemente muestra/oculta sin animar
    if (typeof cents !== "number") {
      setDisplay(null);
      fromRef.current = 0;
      return;
    }

    // Primera vez con valor → mostrar instantáneo
    if (display === null) {
      setDisplay(cents);
      fromRef.current = cents;
      return;
    }

    // No animar si el cambio es trivial
    if (Math.abs(cents - fromRef.current) < 1) {
      setDisplay(cents);
      fromRef.current = cents;
      return;
    }

    // Respect motion preference
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(cents);
      fromRef.current = cents;
      return;
    }

    // Interpolación rAF
    const from = display;
    const to = cents;
    const start = performance.now();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const v = Math.round(from + (to - from) * eased);
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);

  if (display === null) return <span className={className}>{placeholder}</span>;
  return <span className={className}>{format(display)}</span>;
}
