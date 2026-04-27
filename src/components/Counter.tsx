"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

/**
 * Anima un valor numérico desde 0 hasta `value` cuando entra en viewport.
 * Si recibe `prefix`/`suffix`, los renderiza alrededor.
 * Si `value` es null (p.ej. "100%"), simplemente renderiza el `staticLabel`.
 */
export function Counter({
  value,
  staticLabel,
  prefix = "",
  suffix = "",
  duration = 1200,
  format,
}: {
  value: number | null;
  staticLabel?: string;
  prefix?: string;
  suffix?: string;
  duration?: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || value == null) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  if (value == null) return <span ref={ref}>{staticLabel}</span>;

  const display = format ? format(n) : n.toLocaleString("es-ES");
  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
